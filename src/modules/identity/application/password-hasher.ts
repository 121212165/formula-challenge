/**
 * PasswordHasher —— 密码哈希接口（应用层依赖抽象，不关心实现）。
 */

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(plain: string, hashed: string): Promise<boolean>;
}
