-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ContentItemStatus" AS ENUM ('draft', 'review', 'published', 'archived');

-- CreateEnum
CREATE TYPE "KnowledgePointStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('free_recall', 'fill_blank', 'recognition', 'ordering');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('submitted', 'evaluated', 'reviewed');

-- CreateEnum
CREATE TYPE "ReviewRating" AS ENUM ('again', 'hard', 'good', 'easy');

-- CreateEnum
CREATE TYPE "StudySessionMode" AS ENUM ('daily', 'review', 'free', 'topic', 'diagnostic');

-- CreateEnum
CREATE TYPE "StudySessionStatus" AS ENUM ('active', 'completed', 'abandoned');

-- CreateEnum
CREATE TYPE "SessionItemStatus" AS ENUM ('pending', 'active', 'completed', 'skipped');

-- CreateEnum
CREATE TYPE "StudyPlanSource" AS ENUM ('scheduler', 'ai', 'manual');

-- CreateEnum
CREATE TYPE "StudyPlanStatus" AS ENUM ('draft', 'active', 'completed', 'expired');

-- CreateEnum
CREATE TYPE "StudyPlanItemType" AS ENUM ('new', 'review', 'weakness');

-- CreateEnum
CREATE TYPE "StudyPlanItemStatus" AS ENUM ('pending', 'completed', 'skipped');

-- CreateEnum
CREATE TYPE "AiMessageRole" AS ENUM ('system', 'user', 'assistant');

-- CreateEnum
CREATE TYPE "ContentIssueType" AS ENUM ('incorrect', 'missing', 'unclear', 'source', 'other');

-- CreateEnum
CREATE TYPE "ContentIssueStatus" AS ENUM ('pending', 'reviewing', 'accepted', 'rejected');

-- CreateEnum
CREATE TYPE "LearningStage" AS ENUM ('beginner', 'intermediate', 'advanced', 'exam');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "emailVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_learning_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dailyMinutes" INTEGER NOT NULL DEFAULT 20,
    "dailyItemTarget" INTEGER NOT NULL DEFAULT 10,
    "learningStage" "LearningStage" NOT NULL DEFAULT 'beginner',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_learning_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_subject_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_subject_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credentials" (
    "userId" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credentials_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subject_categories" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "subject_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_items" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "categoryId" TEXT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ContentItemStatus" NOT NULL DEFAULT 'draft',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "formula_contents" (
    "contentItemId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT '',
    "alias" JSONB NOT NULL DEFAULT '[]',
    "level" TEXT NOT NULL DEFAULT '',
    "mnemonic" TEXT,
    "mnemonicExplanation" TEXT,

    CONSTRAINT "formula_contents_pkey" PRIMARY KEY ("contentItemId")
);

-- CreateTable
CREATE TABLE "herb_contents" (
    "contentItemId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT '',
    "alias" JSONB NOT NULL DEFAULT '[]',
    "property" TEXT NOT NULL DEFAULT '',
    "meridian" TEXT NOT NULL DEFAULT '',
    "usage" TEXT NOT NULL DEFAULT '',
    "contraindications" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "herb_contents_pkey" PRIMARY KEY ("contentItemId")
);

-- CreateTable
CREATE TABLE "meridians" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "meridians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acupoint_contents" (
    "contentItemId" TEXT NOT NULL,
    "pinyin" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "meridianId" TEXT NOT NULL,
    "location" TEXT NOT NULL DEFAULT '',
    "method" TEXT NOT NULL DEFAULT '',
    "caution" TEXT NOT NULL DEFAULT '',
    "special" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "acupoint_contents_pkey" PRIMARY KEY ("contentItemId")
);

-- CreateTable
CREATE TABLE "content_sources" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "edition" TEXT,
    "publisher" TEXT,
    "year" INTEGER,
    "citation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_versions" (
    "id" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "sourceId" TEXT,
    "contentHash" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_points" (
    "id" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "canonicalAnswer" TEXT NOT NULL,
    "explanation" TEXT,
    "difficulty" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "status" "KnowledgePointStatus" NOT NULL DEFAULT 'draft',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "knowledge_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_templates" (
    "id" TEXT NOT NULL,
    "knowledgePointType" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,
    "difficulty" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "config" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "question_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_instances" (
    "id" TEXT NOT NULL,
    "sessionItemId" TEXT NOT NULL,
    "knowledgePointId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "mode" "StudySessionMode" NOT NULL DEFAULT 'daily',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "status" "StudySessionStatus" NOT NULL DEFAULT 'active',
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "study_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_items" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "knowledgePointId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "status" "SessionItemStatus" NOT NULL DEFAULT 'pending',
    "questionInstanceId" TEXT,

    CONSTRAINT "session_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sessionItemId" TEXT NOT NULL,
    "questionInstanceId" TEXT NOT NULL,
    "knowledgePointId" TEXT NOT NULL,
    "userAnswer" TEXT NOT NULL DEFAULT '',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "timeSpentSeconds" INTEGER NOT NULL DEFAULT 0,
    "status" "AttemptStatus" NOT NULL DEFAULT 'submitted',
    "clientRequestId" TEXT NOT NULL,

    CONSTRAINT "attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluations" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_events" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "knowledgePointId" TEXT NOT NULL,
    "rating" "ReviewRating" NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previousState" JSONB NOT NULL,
    "nextState" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_states" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "knowledgePointId" TEXT NOT NULL,
    "stability" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "difficulty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retrievability" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "lastReviewedAt" TIMESTAMP(3),
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "lapseCount" INTEGER NOT NULL DEFAULT 0,
    "lastRating" "ReviewRating",
    "fsrsState" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_days" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL DEFAULT 0,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "newCount" INTEGER NOT NULL DEFAULT 0,
    "completedSessionCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "study_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_plans" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "source" "StudyPlanSource" NOT NULL DEFAULT 'scheduler',
    "status" "StudyPlanStatus" NOT NULL DEFAULT 'draft',

    CONSTRAINT "study_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_plan_items" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "knowledgePointId" TEXT NOT NULL,
    "type" "StudyPlanItemType" NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "status" "StudyPlanItemStatus" NOT NULL DEFAULT 'pending',

    CONSTRAINT "study_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subjectId" TEXT,
    "knowledgePointId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "AiMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "model" TEXT,
    "tokenCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_issues" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "knowledgePointId" TEXT,
    "type" "ContentIssueType" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ContentIssueStatus" NOT NULL DEFAULT 'pending',
    "reviewerId" TEXT,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_issues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_learning_profiles_userId_key" ON "user_learning_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_subject_preferences_userId_subjectId_key" ON "user_subject_preferences"("userId", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_tokenHash_key" ON "email_verification_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "email_verification_tokens_userId_idx" ON "email_verification_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_code_key" ON "subjects"("code");

-- CreateIndex
CREATE INDEX "subject_categories_subjectId_sortOrder_idx" ON "subject_categories"("subjectId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "subject_categories_subjectId_name_key" ON "subject_categories"("subjectId", "name");

-- CreateIndex
CREATE INDEX "content_items_subjectId_status_sortOrder_idx" ON "content_items"("subjectId", "status", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "content_items_subjectId_slug_key" ON "content_items"("subjectId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "meridians_name_key" ON "meridians"("name");

-- CreateIndex
CREATE UNIQUE INDEX "meridians_code_key" ON "meridians"("code");

-- CreateIndex
CREATE UNIQUE INDEX "acupoint_contents_code_key" ON "acupoint_contents"("code");

-- CreateIndex
CREATE INDEX "acupoint_contents_meridianId_idx" ON "acupoint_contents"("meridianId");

-- CreateIndex
CREATE INDEX "content_versions_contentItemId_createdAt_idx" ON "content_versions"("contentItemId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "content_versions_contentItemId_version_key" ON "content_versions"("contentItemId", "version");

-- CreateIndex
CREATE INDEX "knowledge_points_contentItemId_status_idx" ON "knowledge_points"("contentItemId", "status");

-- CreateIndex
CREATE INDEX "knowledge_points_type_idx" ON "knowledge_points"("type");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_points_contentItemId_code_key" ON "knowledge_points"("contentItemId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "question_templates_knowledgePointType_type_key" ON "question_templates"("knowledgePointType", "type");

-- CreateIndex
CREATE INDEX "question_instances_sessionItemId_idx" ON "question_instances"("sessionItemId");

-- CreateIndex
CREATE INDEX "question_instances_knowledgePointId_idx" ON "question_instances"("knowledgePointId");

-- CreateIndex
CREATE INDEX "study_sessions_userId_startedAt_idx" ON "study_sessions"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "session_items_sessionId_status_idx" ON "session_items"("sessionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "session_items_sessionId_position_key" ON "session_items"("sessionId", "position");

-- CreateIndex
CREATE INDEX "attempts_sessionId_idx" ON "attempts"("sessionId");

-- CreateIndex
CREATE INDEX "attempts_knowledgePointId_idx" ON "attempts"("knowledgePointId");

-- CreateIndex
CREATE UNIQUE INDEX "attempts_userId_clientRequestId_key" ON "attempts"("userId", "clientRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "evaluations_attemptId_key" ON "evaluations"("attemptId");

-- CreateIndex
CREATE INDEX "evaluations_userId_idx" ON "evaluations"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "review_events_attemptId_key" ON "review_events"("attemptId");

-- CreateIndex
CREATE INDEX "review_events_userId_reviewedAt_idx" ON "review_events"("userId", "reviewedAt");

-- CreateIndex
CREATE INDEX "learning_states_userId_dueAt_idx" ON "learning_states"("userId", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "learning_states_userId_knowledgePointId_key" ON "learning_states"("userId", "knowledgePointId");

-- CreateIndex
CREATE INDEX "study_days_userId_localDate_idx" ON "study_days"("userId", "localDate");

-- CreateIndex
CREATE UNIQUE INDEX "study_days_userId_localDate_key" ON "study_days"("userId", "localDate");

-- CreateIndex
CREATE UNIQUE INDEX "study_plans_userId_localDate_key" ON "study_plans"("userId", "localDate");

-- CreateIndex
CREATE INDEX "study_plan_items_planId_status_position_idx" ON "study_plan_items"("planId", "status", "position");

-- CreateIndex
CREATE UNIQUE INDEX "study_plan_items_planId_knowledgePointId_key" ON "study_plan_items"("planId", "knowledgePointId");

-- CreateIndex
CREATE INDEX "ai_conversations_userId_createdAt_idx" ON "ai_conversations"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_messages_conversationId_createdAt_idx" ON "ai_messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "content_issues_contentItemId_status_idx" ON "content_issues"("contentItemId", "status");

-- CreateIndex
CREATE INDEX "content_issues_reporterId_createdAt_idx" ON "content_issues"("reporterId", "createdAt");

-- AddForeignKey
ALTER TABLE "user_learning_profiles" ADD CONSTRAINT "user_learning_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_subject_preferences" ADD CONSTRAINT "user_subject_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_categories" ADD CONSTRAINT "subject_categories_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "subject_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formula_contents" ADD CONSTRAINT "formula_contents_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "herb_contents" ADD CONSTRAINT "herb_contents_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acupoint_contents" ADD CONSTRAINT "acupoint_contents_meridianId_fkey" FOREIGN KEY ("meridianId") REFERENCES "meridians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acupoint_contents" ADD CONSTRAINT "acupoint_contents_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "content_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_points" ADD CONSTRAINT "knowledge_points_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_instances" ADD CONSTRAINT "question_instances_sessionItemId_fkey" FOREIGN KEY ("sessionItemId") REFERENCES "session_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_instances" ADD CONSTRAINT "question_instances_knowledgePointId_fkey" FOREIGN KEY ("knowledgePointId") REFERENCES "knowledge_points"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_instances" ADD CONSTRAINT "question_instances_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "question_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_items" ADD CONSTRAINT "session_items_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "study_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_items" ADD CONSTRAINT "session_items_knowledgePointId_fkey" FOREIGN KEY ("knowledgePointId") REFERENCES "knowledge_points"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "study_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_sessionItemId_fkey" FOREIGN KEY ("sessionItemId") REFERENCES "session_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_questionInstanceId_fkey" FOREIGN KEY ("questionInstanceId") REFERENCES "question_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_knowledgePointId_fkey" FOREIGN KEY ("knowledgePointId") REFERENCES "knowledge_points"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_events" ADD CONSTRAINT "review_events_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_events" ADD CONSTRAINT "review_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_events" ADD CONSTRAINT "review_events_knowledgePointId_fkey" FOREIGN KEY ("knowledgePointId") REFERENCES "knowledge_points"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_states" ADD CONSTRAINT "learning_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_states" ADD CONSTRAINT "learning_states_knowledgePointId_fkey" FOREIGN KEY ("knowledgePointId") REFERENCES "knowledge_points"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_days" ADD CONSTRAINT "study_days_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_plans" ADD CONSTRAINT "study_plans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_plan_items" ADD CONSTRAINT "study_plan_items_planId_fkey" FOREIGN KEY ("planId") REFERENCES "study_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_plan_items" ADD CONSTRAINT "study_plan_items_knowledgePointId_fkey" FOREIGN KEY ("knowledgePointId") REFERENCES "knowledge_points"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_issues" ADD CONSTRAINT "content_issues_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_issues" ADD CONSTRAINT "content_issues_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_issues" ADD CONSTRAINT "content_issues_knowledgePointId_fkey" FOREIGN KEY ("knowledgePointId") REFERENCES "knowledge_points"("id") ON DELETE SET NULL ON UPDATE CASCADE;

