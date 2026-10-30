#!/usr/bin/env bash
# Run all 10 required test scenarios against the live API.
set -u
TOKEN_ADMIN=$(curl -s -X POST http://127.0.0.1:5000/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@crm.io","password":"admin123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
TOKEN_LEAD=$(curl -s -X POST http://127.0.0.1:5000/api/auth/login -H "Content-Type: application/json" -d '{"email":"lead@crm.io","password":"lead123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
TOKEN_EMP=$(curl -s -X POST http://127.0.0.1:5000/api/auth/login -H "Content-Type: application/json" -d '{"email":"rahul@crm.io","password":"rahul123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
mk() { curl -s -X POST http://127.0.0.1:5000/api/cases -H "Authorization: Bearer $1" -H "Content-Type: application/json" -d "$2"; }

echo "=== Test 1: Automatic assignment (Technical Support -> Rahul or Anita) ==="
R1=$(mk "$TOKEN_ADMIN" '{"title":"T1 TS case","category":"Technical Support","description":"x"}' | python3 -c "import sys,json;c=json.load(sys.stdin)['case'];print(f\"{c['case_code']} -> {c.get('assigned_to_name','?')} | method via history\")")
echo "  $R1"

echo "=== Test 2: Workload balancing (4 more TS cases, watch distribution) ==="
for i in 1 2 3 4; do
  R=$(mk "$TOKEN_ADMIN" "{\"title\":\"T2 TS $i\",\"category\":\"Technical Support\",\"description\":\"x\"}" | python3 -c "import sys,json;c=json.load(sys.stdin)['case'];print(f\"  {c['case_code']} -> {c.get('assigned_to_name','?')}\")")
  echo "$R"
done

echo "=== Test 3: Skills matching (Compliance -> only Vikram) ==="
R3=$(mk "$TOKEN_ADMIN" '{"title":"T3 Compliance","category":"Compliance","description":"x"}' | python3 -c "import sys,json;c=json.load(sys.stdin)['case'];print(f\"  {c['case_code']} -> {c.get('assigned_to_name','?')} (should be Vikram Nair)\")")
echo "$R3"
echo "  --- Onboarding -> only Anita has Onboarding skill ---"
R3b=$(mk "$TOKEN_ADMIN" '{"title":"T3b Onboarding","category":"Onboarding","description":"x"}' | python3 -c "import sys,json;c=json.load(sys.stdin)['case'];print(f\"  {c['case_code']} -> {c.get('assigned_to_name','?')} (should be Anita Desai)\")")
echo "$R3b"

echo "=== Test 4: Employee manual assignment BLOCKED (UI has no dropdown + API rejects) ==="
echo "  -- API: employee sends assigned_to=4 ->"
curl -s -X POST http://127.0.0.1:5000/api/cases -H "Authorization: Bearer $TOKEN_EMP" -H "Content-Type: application/json" -d '{"title":"T4 manual try","category":"Billing","assigned_to":4,"description":"x"}' | python3 -c "import sys,json;d=json.load(sys.stdin);print(f'    HTTP error: {d.get(\"error\",\"??\")[:80]}')"
curl -s -X POST http://127.0.0.1:5000/api/cases -H "Authorization: Bearer $TOKEN_EMP" -H "Content-Type: application/json" -d '{"title":"T4 manual try","category":"Billing","assigned_to":4,"description":"x"}' -o /dev/null -w "    HTTP status: %{http_code} (403 = correct)\n"

echo "=== Test 5: Team Lead manual assignment BLOCKED ==="
curl -s -X POST http://127.0.0.1:5000/api/cases -H "Authorization: Bearer $TOKEN_LEAD" -H "Content-Type: application/json" -d '{"title":"T5 lead try","category":"Billing","assigned_to":6,"description":"x"}' -o /dev/null -w "    HTTP status: %{http_code} (403 = correct)\n"
# Also try PUT reassignment as lead
CID=$(PYTHONPATH=/home/z/my-project/backend python3 -c "import database as db;print(db.fetch_one('SELECT case_id FROM cases LIMIT 1')['case_id'])")
echo "  -- Team Lead tries PUT assigned_to=6 on case $CID ->"
curl -s -X PUT http://127.0.0.1:5000/api/cases/$CID -H "Authorization: Bearer $TOKEN_LEAD" -H "Content-Type: application/json" -d '{"assigned_to":6}' | python3 -c "import sys,json;d=json.load(sys.stdin);print(f'    HTTP error: {d.get(\"error\",\"??\")[:80]}')"
curl -s -X PUT http://127.0.0.1:5000/api/cases/$CID -H "Authorization: Bearer $TOKEN_LEAD" -H "Content-Type: application/json" -d '{"assigned_to":6}' -o /dev/null -w "    HTTP status: %{http_code} (403 = correct)\n"

echo "=== Test 6: Admin can manage skills/availability but CANNOT manually assign ==="
echo "  -- Admin sets Rahul availability=Unavailable ->"
curl -s -X PUT http://127.0.0.1:5000/api/auth/users/3 -H "Authorization: Bearer $TOKEN_ADMIN" -H "Content-Type: application/json" -d '{"availability":"Unavailable"}' | python3 -c "import sys,json;d=json.load(sys.stdin);print(f'    OK: {d[\"user\"][\"name\"]} -> {d[\"user\"][\"availability\"]}')"
echo "  -- Admin tries manual assignment (should still 403) ->"
curl -s -X POST http://127.0.0.1:5000/api/cases -H "Authorization: Bearer $TOKEN_ADMIN" -H "Content-Type: application/json" -d '{"title":"T6 admin manual","category":"Billing","assigned_to":5,"description":"x"}' -o /dev/null -w "    HTTP status: %{http_code} (403 = correct)\n"

echo "=== Test 7: Automatic reassignment when employee becomes Unavailable ==="
echo "  -- Rahul has TS cases. He was set Unavailable above. Check his TS cases were re-queued/reassigned ---"
PYTHONPATH=/home/z/my-project/backend python3 -c "
import database as db
print('  cases still assigned to Rahul (user 3):', db.fetch_one(\"SELECT COUNT(*) AS c FROM cases WHERE assigned_to=3 AND status<>'Completed'\")['c'])
print('  awaiting assignment cases:', db.fetch_one(\"SELECT COUNT(*) AS c FROM cases WHERE assignment_status='Awaiting Assignment'\")['c'])
# TS cases that were Rahul's should now be reassigned to Anita (only other TS-skilled available employee)
print('  TS cases now assigned to Anita (user 6):', db.fetch_one(\"SELECT COUNT(*) AS c FROM cases WHERE assigned_to=6 AND category='Technical Support'\")['c'])
"
echo "  -- Set Rahul back to Available (any Awaiting cases should re-evaluate) --"
curl -s -X PUT http://127.0.0.1:5000/api/auth/users/3 -H "Authorization: Bearer $TOKEN_ADMIN" -H "Content-Type: application/json" -d '{"availability":"Available"}' -o /dev/null
PYTHONPATH=/home/z/my-project/backend python3 -c "
import database as db
print('  awaiting assignment after Rahul available again:', db.fetch_one(\"SELECT COUNT(*) AS c FROM cases WHERE assignment_status='Awaiting Assignment'\")['c'])
"

echo "=== Test 8: Database persistence (refresh + verify) ==="
echo "  -- DB state --"
PYTHONPATH=/home/z/my-project/backend python3 -c "
import database as db
print('  total cases:', db.fetch_one('SELECT COUNT(*) AS c FROM cases')['c'])
print('  assigned:', db.fetch_one(\"SELECT COUNT(*) AS c FROM cases WHERE assignment_status='Assigned'\")['c'])
print('  awaiting:', db.fetch_one(\"SELECT COUNT(*) AS c FROM cases WHERE assignment_status='Awaiting Assignment'\")['c'])
print('  case_assignments rows:', db.fetch_one('SELECT COUNT(*) AS c FROM case_assignments')['c'])
"

echo "=== Test 9: Employee name retrieved from DB (not hardcoded) ==="
echo "  -- GET /api/cases returns assigned_to_name from the users JOIN --"
curl -s http://127.0.0.1:5000/api/cases -H "Authorization: Bearer $TOKEN_ADMIN" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for c in d['cases'][:3]:
    print(f\"  {c['case_code']} | assigned_to_name: {c.get('assigned_to_name','?')} | assignment_status: {c.get('assignment_status','?')}\")
"

echo "=== Test 10: Existing functionality regression ==="
echo "  -- login, dashboard, create, case details, action timeline, follow-up, productivity, audit --"
curl -s http://127.0.0.1:5000/api/dashboard/summary -H "Authorization: Bearer $TOKEN_ADMIN" | python3 -c "import sys,json;k=json.load(sys.stdin)['kpis'];print(f'  dashboard KPIs: total={k[\"total_cases\"]} active={k[\"active_cases\"]} completed={k[\"completed_cases\"]} overdue={k[\"overdue_cases\"]} actions={k[\"total_actions\"]} auto_assigned={k.get(\"auto_assigned\",0)} awaiting={k.get(\"awaiting_assignment\",0)}')"
echo "  -- record an action --"
ACID=$(PYTHONPATH=/home/z/my-project/backend python3 -c "import database as db;print(db.fetch_one('SELECT case_id FROM cases LIMIT 1')['case_id'])")
curl -s -X POST http://127.0.0.1:5000/api/cases/$ACID/actions -H "Authorization: Bearer $TOKEN_ADMIN" -H "Content-Type: application/json" -d '{"action_type":"contacted","description":"Called customer"}' -o /dev/null -w "  action recorded HTTP %{http_code}\n"
echo "  -- audit history --"
curl -s http://127.0.0.1:5000/api/audit -H "Authorization: Bearer $TOKEN_ADMIN" | python3 -c "import sys,json;d=json.load(sys.stdin);print(f'  audit entries: {d[\"count\"]}')"
echo "  -- productivity report --"
curl -s "http://127.0.0.1:5000/api/reports/productivity?user_id=3" -H "Authorization: Bearer $TOKEN_ADMIN" | python3 -c "import sys,json;s=json.load(sys.stdin)['summary'];print(f'  Rahul productivity: {s}')"

echo "=== clean up test cases to restore 0-case demo state ==="
PYTHONPATH=/home/z/my-project/backend python3 -c "
import database as db
db.execute('DELETE FROM audit_logs')
db.execute('DELETE FROM case_status_history')
db.execute('DELETE FROM case_actions')
db.execute('DELETE FROM case_assignments')
db.execute('DELETE FROM cases')
db.execute('UPDATE users SET availability=\\'Available\\' WHERE role=\\'Resource\\'')
print('  cleaned -> cases back to 0, all Resources Available')
"