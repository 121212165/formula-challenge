/**
 * StudyDay —— 用户某本地日期的活动汇总（BR-070 / BR-072）。
 * 是派生的读模型，不是 Attempt/ReviewEvent 的权威来源。
 * UNIQUE(userId, localDate)；localDate 按用户时区计算（BR-061）。
 */

export interface StudyDay {
  id: string;
  userId: string;
  /** "YYYY-MM-DD"，用户时区 */
  localDate: string;
  minutes: number;
  attemptCount: number;
  correctCount: number;
  reviewCount: number;
  newCount: number;
  completedSessionCount: number;
}
