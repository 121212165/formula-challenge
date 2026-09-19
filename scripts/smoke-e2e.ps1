# Phase 10 端到端冒烟：经 Next.js (3001) 跑通 注册→登录→出题→作答→评级→进度
$ErrorActionPreference = 'Stop'
$base = 'http://127.0.0.1:3001'

function Post-Json($path, $body, $token) {
  $headers = @{ 'content-type' = 'application/json' }
  if ($token) { $headers['authorization'] = "Bearer $token" }
  $r = Invoke-RestMethod -Method Post -Uri ($base + $path) -Headers $headers -Body ($body | ConvertTo-Json -Depth 8)
  return $r
}
function Get-Json($path, $token) {
  $headers = @{}
  if ($token) { $headers['authorization'] = "Bearer $token" }
  return Invoke-RestMethod -Method Get -Uri ($base + $path) -Headers $headers
}

$email = "smoke_$(Get-Random)@test.com"
Write-Host "== 1. register =="
$reg = Post-Json '/api/auth/register' @{ email=$email; password='smoke-pass-123'; timezone='America/Los_Angeles'; name='冒烟' } $null
Write-Host "user.id = $($reg.user.id)"

Write-Host "== 2. login =="
$login = Post-Json '/api/auth/login' @{ email=$email; password='smoke-pass-123' } $null
$token = $login.token
Write-Host "token len = $($token.Length)"

Write-Host "== 3. subjects =="
$subs = Get-Json '/api/subjects' $token
Write-Host "subjects = $(($subs.subjects | ForEach-Object { $_.name }) -join ', ')"
$subjId = $subs.subjects[0].id

Write-Host "== 4. generate plan =="
$plan = Post-Json '/api/study-plans/generate' @{ subjectIds=@($subjId) } $token
Write-Host "plan.id = $($plan.plan.id)  items = $($plan.items.Count)"

Write-Host "== 5. today plan =="
$today = Get-Json '/api/study-plans/today' $token
Write-Host "today localDate = $($today.localDate)"

# 取一个 knowledgePointId：优先 plan item，否则从 content
$kpId = $null
if ($plan.items.Count -gt 0 -and $plan.items[0].knowledgePointId) { $kpId = $plan.items[0].knowledgePointId }
if (-not $kpId) {
  $cl = Get-Json "/api/content?subjectId=$subjId" $token
  $cp = $cl.content[0].id
  $kps = Get-Json "/api/content/$cp/knowledge-points" $token
  $kpId = $kps.knowledgePoints[0].id
}
Write-Host "kpId = $kpId"

Write-Host "== 6. start session =="
$sess = Post-Json '/api/sessions' @{ subjectId=$subjId; knowledgePointIds=@($kpId); mode='daily' } $token
$sessionId = $sess.session.id
Write-Host "session.id = $sessionId  items = $($sess.items.Count)"
$itemId = $sess.items[0].id

Write-Host "== 7. next item =="
$next = Post-Json "/api/sessions/$sessionId/items" @{} $token
Write-Host "item.status = $($next.item.status)"

Write-Host "== 8. question =="
$q = Post-Json "/api/sessions/$sessionId/items/$itemId/question" @{ type='free_recall' } $token
Write-Host "question.kind = $($q.question.kind)  stem = $($q.question.stem)"
$ans = if ($q.question.acceptedAnswers) { $q.question.acceptedAnswers[0] } elseif ($q.question.correctAnswer) { $q.question.correctAnswer } else { '测试作答' }

Write-Host "== 9. attempt =="
$att = Post-Json '/api/attempts' @{ sessionItemId=$itemId; userAnswer=$ans; clientRequestId=([guid]::NewGuid().ToString()); startedAt=(Get-Date).ToUniversalTime().ToString('o') } $token
Write-Host "attempt.id = $($att.attempt.id)  created = $($att.created)"
$attemptId = $att.attempt.id

Write-Host "== 10. review(good) =="
$rev = Post-Json "/api/attempts/$attemptId/review" @{ rating='good' } $token
Write-Host "evaluation.isCorrect = $($rev.evaluation.isCorrect)  review.created = $($rev.review.created)"

Write-Host "== 11. progress =="
$prog = Get-Json "/api/progress?subjectId=$subjId" $token
Write-Host "coverage learned=$($prog.coverage.learnedCount)/$($prog.coverage.publishedTotal)  reviewedCount=$($prog.reviewedCount)"

Write-Host "== ALL SMOKE STEPS PASSED =="
