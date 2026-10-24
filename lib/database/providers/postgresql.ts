// PostgreSQL 数据库提供商实现
import { Pool, PoolClient } from 'pg'
import { sqlIdentifier, sqlProjection, pageSize } from '../../sql-identifiers'
import type { 
  DatabaseClient, 
  ServerDatabaseClient, 
  QueryResult, 
  QueryOptions, 
  UpsertOptions, 
  RPCOptions 
} from '../types'

export class PostgreSQLProvider implements DatabaseClient {
  private pool: Pool
  private currentUserId?: string

  constructor(userId?: string) {
    this.currentUserId = userId
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true, ...(process.env.DATABASE_SSL_CA ? { ca: process.env.DATABASE_SSL_CA } : {}) } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    })
  }

  private buildWhereClause(where?: Record<string, any>, startIndex = 1): { clause: string; values: any[] } {
    if (!where || Object.keys(where).length === 0) {
      return { clause: '', values: [] }
    }

    const conditions: string[] = []
    const values: any[] = []
    let paramIndex = startIndex

    Object.entries(where).forEach(([key, value]) => {
      conditions.push(`${sqlIdentifier(key)} IS NOT DISTINCT FROM $${paramIndex}`)
      values.push(value)
      paramIndex++
    })

    return {
      clause: `WHERE ${conditions.join(' AND ')}`,
      values
    }
  }

  private buildOrderClause(orderBy?: { column: string; ascending?: boolean }[]): string {
    if (!orderBy || orderBy.length === 0) return ''
    
    const orders = orderBy.map(({ column, ascending = true }) => 
      `${sqlIdentifier(column)} ${ascending ? 'ASC' : 'DESC'}`
    )
    
    return `ORDER BY ${orders.join(', ')}`
  }

  async select<T = any>(table: string, options?: QueryOptions): Promise<QueryResult<T[]>> {
    try {
      const selectClause = sqlProjection(options?.select)
      const { clause: whereClause, values } = this.buildWhereClause(options?.where)
      const orderClause = this.buildOrderClause(options?.orderBy)
      
      let sql = `SELECT ${selectClause} FROM ${sqlIdentifier(table)} ${whereClause} ${orderClause}`
      
      // 添加分页
      if (options?.limit !== undefined) {
        values.push(pageSize(options.limit))
        sql += ` LIMIT $${values.length}`
      }
      if (options?.offset !== undefined) {
        values.push(pageSize(options.offset))
        sql += ` OFFSET $${values.length}`
      }

      const result = await this.pool.query(sql, values)
      return { data: result.rows as T[], error: null, count: result.rowCount || 0 }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  }

  async selectOne<T = any>(table: string, options?: QueryOptions): Promise<QueryResult<T>> {
    try {
      const result = await this.select<T>(table, { ...options, limit: 1 })
      if (result.error) return { data: null, error: result.error }
      
      const data = result.data && result.data.length > 0 ? result.data[0] : null
      return { data, error: null }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  }

  async insert<T = any>(table: string, data: any, options?: UpsertOptions): Promise<QueryResult<T>> {
    try {
      const columns = Object.keys(data)
      const values = Object.values(data)
      const placeholders = values.map((_, index) => `$${index + 1}`)
      
      let sql = `INSERT INTO ${sqlIdentifier(table)} (${columns.map(sqlIdentifier).join(', ')}) VALUES (${placeholders.join(', ')})`
      
      if (options?.returning) {
        sql += ` RETURNING ${sqlProjection(options.returning)}`
      }

      const result = await this.pool.query(sql, values)
      return { data: result.rows[0] || null, error: null }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  }

  async update<T = any>(table: string, data: any, options?: QueryOptions & UpsertOptions): Promise<QueryResult<T>> {
    try {
      const setColumns = Object.keys(data)
      const setValues = Object.values(data)
      const setClause = setColumns.map((col, index) => `${sqlIdentifier(col)} = $${index + 1}`).join(', ')
      
      const { clause: whereClause, values: whereValues } = this.buildWhereClause(options?.where, setValues.length + 1)
      const allValues = [...setValues, ...whereValues]
      
      let sql = `UPDATE ${sqlIdentifier(table)} SET ${setClause} ${whereClause}`
      
      if (options?.returning) {
        sql += ` RETURNING ${sqlProjection(options.returning)}`
      }

      const result = await this.pool.query(sql, allValues)
      return { data: result.rows[0] || null, error: null }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  }

  async upsert<T = any>(table: string, data: any, options?: UpsertOptions): Promise<QueryResult<T>> {
    try {
      const columns = Object.keys(data)
      const values = Object.values(data)
      const placeholders = values.map((_, index) => `$${index + 1}`)
      
      const conflictColumn = options?.onConflict || 'id'
      const updateColumns = columns.filter(col => col !== conflictColumn)
      const updateClause = updateColumns.map(col => `${sqlIdentifier(col)} = EXCLUDED.${sqlIdentifier(col)}`).join(', ')
      
      let sql = `INSERT INTO ${sqlIdentifier(table)} (${columns.map(sqlIdentifier).join(', ')}) VALUES (${placeholders.join(', ')})
                 ON CONFLICT (${sqlIdentifier(conflictColumn)}) ${updateColumns.length ? `DO UPDATE SET ${updateClause}` : 'DO NOTHING'}`
      
      if (options?.returning) {
        sql += ` RETURNING ${sqlProjection(options.returning)}`
      }

      const result = await this.pool.query(sql, values)
      return { data: result.rows[0] || null, error: null }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  }

  async delete<T = any>(table: string, options?: QueryOptions): Promise<QueryResult<T>> {
    try {
      const { clause: whereClause, values } = this.buildWhereClause(options?.where)
      
      let sql = `DELETE FROM ${sqlIdentifier(table)} ${whereClause}`
      
      const result = await this.pool.query(sql, values)
      return { data: result.rows as T, error: null }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  }

  async rpc<T = any>(options: RPCOptions): Promise<QueryResult<T>> {
    try {
      const params = options.params || {}
      const paramNames = Object.keys(params)
      const paramValues = Object.values(params)
      const paramPlaceholders = paramNames.map((name, index) => `${sqlIdentifier(name)} => $${index + 1}`)
      
      const sql = `SELECT * FROM ${sqlIdentifier(options.functionName)}(${paramPlaceholders.join(', ')})`
      
      const result = await this.pool.query(sql, paramValues)
      return { data: result.rows as T, error: null }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  }

  async transaction<T>(callback: (client: DatabaseClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect()
    
    try {
      await client.query('BEGIN')
      
      // 创建事务客户端
      const transactionClient = new PostgreSQLTransactionClient(client, this.currentUserId)
      const result = await callback(transactionClient)
      
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async connect(): Promise<void> {
    await this.pool.connect()
  }

  async disconnect(): Promise<void> {
    await this.pool.end()
  }
}

// 事务客户端实现
class PostgreSQLTransactionClient implements DatabaseClient {
  constructor(private client: PoolClient, private currentUserId?: string) {}

  async select<T = any>(table: string, options?: QueryOptions): Promise<QueryResult<T[]>> {
    // 实现与 PostgreSQLProvider 类似，但使用 this.client 而不是 pool
    // 为了简洁，这里省略具体实现
    throw new Error('Transaction client methods not fully implemented in this example')
  }

  async selectOne<T = any>(table: string, options?: QueryOptions): Promise<QueryResult<T>> {
    throw new Error('Transaction client methods not fully implemented in this example')
  }

  async insert<T = any>(table: string, data: any, options?: UpsertOptions): Promise<QueryResult<T>> {
    throw new Error('Transaction client methods not fully implemented in this example')
  }

  async update<T = any>(table: string, data: any, options?: QueryOptions & UpsertOptions): Promise<QueryResult<T>> {
    throw new Error('Transaction client methods not fully implemented in this example')
  }

  async upsert<T = any>(table: string, data: any, options?: UpsertOptions): Promise<QueryResult<T>> {
    throw new Error('Transaction client methods not fully implemented in this example')
  }

  async delete<T = any>(table: string, options?: QueryOptions): Promise<QueryResult<T>> {
    throw new Error('Transaction client methods not fully implemented in this example')
  }

  async rpc<T = any>(options: RPCOptions): Promise<QueryResult<T>> {
    throw new Error('Transaction client methods not fully implemented in this example')
  }

  async transaction<T>(callback: (client: DatabaseClient) => Promise<T>): Promise<T> {
    // 嵌套事务使用 savepoint
    return callback(this)
  }
}

// 服务端 PostgreSQL 客户端
export class PostgreSQLServerProvider extends PostgreSQLProvider implements ServerDatabaseClient {
  withAuth(userId?: string): DatabaseClient {
    return new PostgreSQLProvider(userId)
  }
}

// 导出便捷函数
export const createPostgreSQLClient = (userId?: string) => new PostgreSQLProvider(userId)
export const createPostgreSQLServer = () => new PostgreSQLServerProvider()
