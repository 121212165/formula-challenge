import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
try {
  const [answers, mastery, plans, sessions, convs, streaks] = await Promise.all([
    p.answerLog.count(),
    p.userMastery.count(),
    p.dailyPlan.count(),
    p.studySession.count(),
    p.aiConversation.count(),
    p.userStreak.count(),
  ]);
  console.log(JSON.stringify({ answerLogs: answers, masteryRows: mastery, dailyPlans: plans, studySessions: sessions, aiConversations: convs, streaks: streaks }, null, 2));
  const users = await p.user.findMany({ select: { id: true, email: true, name: true, studyStage: true, dailyGoal: true } });
  console.log("USERS:", JSON.stringify(users));
  const logs = await p.answerLog.findMany({ orderBy: { createdAt: "desc" }, take: 5, select: { userId: true, formulaId: true, mode: true, questionType: true, isCorrect: true, matchScore: true, rating: true, createdAt: true } });
  console.log("RECENT_LOGS:", JSON.stringify(logs, null, 1));
} catch (e) { console.log("DB_ERR:", String(e.message || e).slice(0, 300)); }
finally { await p.$disconnect(); }
