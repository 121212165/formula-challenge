-- down.sql —— 0001_init 回滚脚本（PostgreSQL）。
-- 目的：清空本 migration 建立的全部表、索引与枚举类型。
-- 说明：PostgreSQL 下使用 DROP TABLE ... CASCADE 自动解除外键依赖；
--       顺序按"先依赖方后被依赖方"排列，即便不用 CASCADE 也可执行。
-- 警告：本脚本会删除全部业务数据，仅用于开发/测试环境的整体降级。

-- ==================== 先删依赖方表 ====================
DROP TABLE IF EXISTS "content_issues" CASCADE;

DROP TABLE IF EXISTS "ai_messages" CASCADE;
DROP TABLE IF EXISTS "ai_conversations" CASCADE;

DROP TABLE IF EXISTS "study_plan_items" CASCADE;
DROP TABLE IF EXISTS "study_plans" CASCADE;

DROP TABLE IF EXISTS "study_days" CASCADE;

DROP TABLE IF EXISTS "learning_states" CASCADE;

DROP TABLE IF EXISTS "review_events" CASCADE;
DROP TABLE IF EXISTS "evaluations" CASCADE;
DROP TABLE IF EXISTS "attempts" CASCADE;

DROP TABLE IF EXISTS "session_items" CASCADE;
DROP TABLE IF EXISTS "study_sessions" CASCADE;

DROP TABLE IF EXISTS "question_instances" CASCADE;
DROP TABLE IF EXISTS "question_templates" CASCADE;

DROP TABLE IF EXISTS "knowledge_points" CASCADE;

DROP TABLE IF EXISTS "content_versions" CASCADE;
DROP TABLE IF EXISTS "content_sources" CASCADE;

DROP TABLE IF EXISTS "acupoint_contents" CASCADE;
DROP TABLE IF EXISTS "meridians" CASCADE;
DROP TABLE IF EXISTS "herb_contents" CASCADE;
DROP TABLE IF EXISTS "formula_contents" CASCADE;

DROP TABLE IF EXISTS "content_items" CASCADE;
DROP TABLE IF EXISTS "subject_categories" CASCADE;
DROP TABLE IF EXISTS "subjects" CASCADE;

-- ==================== Identity 表 ====================
DROP TABLE IF EXISTS "credentials" CASCADE;
DROP TABLE IF EXISTS "password_reset_tokens" CASCADE;
DROP TABLE IF EXISTS "email_verification_tokens" CASCADE;
DROP TABLE IF EXISTS "user_subject_preferences" CASCADE;
DROP TABLE IF EXISTS "user_learning_profiles" CASCADE;
DROP TABLE IF EXISTS "User" CASCADE;

-- ==================== 枚举类型 ====================
DROP TYPE IF EXISTS "StudyPlanItemStatus";
DROP TYPE IF EXISTS "StudyPlanItemType";
DROP TYPE IF EXISTS "StudyPlanStatus";
DROP TYPE IF EXISTS "StudyPlanSource";
DROP TYPE IF EXISTS "SessionItemStatus";
DROP TYPE IF EXISTS "StudySessionStatus";
DROP TYPE IF EXISTS "StudySessionMode";
DROP TYPE IF EXISTS "ReviewRating";
DROP TYPE IF EXISTS "AttemptStatus";
DROP TYPE IF EXISTS "QuestionType";
DROP TYPE IF EXISTS "KnowledgePointStatus";
DROP TYPE IF EXISTS "ContentItemStatus";
DROP TYPE IF EXISTS "AiMessageRole";
DROP TYPE IF EXISTS "ContentIssueType";
DROP TYPE IF EXISTS "ContentIssueStatus";
DROP TYPE IF EXISTS "LearningStage";
