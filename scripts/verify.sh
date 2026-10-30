#!/usr/bin/env bash
# Visual verification v2 — uses agent-browser `eval` with the React-aware value
# setter so form fields (incl. native date pickers) are filled reliably.
set -u
mkdir -p /tmp/render
pkill -9 -f "backend/app.py" 2>/dev/null
sleep 1
python3 /home/z/my-project/backend/seed.py >/tmp/seed.log 2>&1
echo "[verify] $(tail -1 /tmp/seed.log)"
setsid python3 /home/z/my-project/backend/app.py >/tmp/flask.log 2>&1 < /dev/null &
FPID=$!
disown 2>/dev/null
sleep 3
AB="agent-browser"
$AB set viewport 1440 900 >/dev/null 2>&1

# Helper: set a React-controlled input/textarea/select value via the native
# value setter + input event, so React's onChange actually fires.
SETJS='function setV(sel, val, isSelect){
  var el = document.querySelector(sel);
  if(!el) return "not-found:"+sel;
  if(isSelect){
    var opt=[...el.options].find(o=>o.text.includes(val) || o.value===val);
    if(!opt) return "no-option:"+val;
    el.value=opt.value;
  } else {
    var proto = el.tagName==="TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto,"value").set.call(el, val);
  }
  el.dispatchEvent(new Event("input",{bubbles:true}));
  el.dispatchEvent(new Event("change",{bubbles:true}));
  return "ok";
}'

$AB open http://127.0.0.1:5000/ >/dev/null 2>&1
$AB wait --load networkidle >/dev/null 2>&1
$AB screenshot /tmp/render/01-login.png >/dev/null 2>&1
$AB find role button click --name "Sign in" >/dev/null 2>&1
$AB wait --load networkidle >/dev/null 2>&1
sleep 1
$AB screenshot /tmp/render/02-overview.png >/dev/null 2>&1
echo "[verify] 02-overview (dashboard with real KPIs)"

# Demo 1: Create a case via the form
$AB open http://127.0.0.1:5000/create-case >/dev/null 2>&1
$AB wait --load networkidle >/dev/null 2>&1
$AB screenshot /tmp/render/03-create-case-empty.png >/dev/null 2>&1
$AB eval "$SETJS setV('input[placeholder*=\"Customer cannot access\"]','Dashboard chart not rendering after date filter')" >/dev/null 2>&1
$AB eval "$SETJS setV('textarea[placeholder*=\"Describe the customer\"]','Customer reports the bar chart on the overview page goes blank when they apply a 7-day filter. Reproduced on Chrome 118. Affects the recharts container sizing.')" >/dev/null 2>&1
$AB eval "$SETJS setV('input[placeholder*=\"Reproduce the issue locally\"]','Reproduce locally and bisect the chart component')" >/dev/null 2>&1
$AB eval "$SETJS setV('input[type=\"date\"]','2026-11-07')" >/dev/null 2>&1     # due date (first date input)
$AB eval "var ds=document.querySelectorAll('input[type=\"date\"]'); var s=ds[1]; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(s,'2026-11-01'); s.dispatchEvent(new Event('input',{bubbles:true})); 'ok'" >/dev/null 2>&1
# Pick an assignee (Rahul Verma)
$AB eval "$SETJS setV('select','Rahul Verma', true)" >/dev/null 2>&1
# Priority -> High (the 2nd select on the page)
$AB eval "var sels=document.querySelectorAll('form select'); var p=sels[1]; var opt=[...p.options].find(o=>o.text==='High'); p.value=opt.value; p.dispatchEvent(new Event('change',{bubbles:true})); 'ok'" >/dev/null 2>&1
sleep 1
$AB screenshot /tmp/render/04-create-case-filled.png >/dev/null 2>&1
echo "[verify] 04-create-case-filled"
$AB find role button click --name "Create case" >/dev/null 2>&1
sleep 2
$AB wait --load networkidle >/dev/null 2>&1
$AB screenshot /tmp/render/05-create-case-drawer.png >/dev/null 2>&1
echo "[verify] 05-create-case-drawer (Demo 1 done)"
# Confirm the drawer opened with a CASE code
$AB snapshot -c 2>&1 | grep -iE "CASE-0|created and assigned|Record Action|History|Edit" | head -8

# Demo 2: Record an action
$AB find text "Record Action" click >/dev/null 2>&1
sleep 1
$AB screenshot /tmp/render/06-action-form.png >/dev/null 2>&1
$AB eval "$SETJS setV('textarea[placeholder*=\"What did you do\"]','Reproduced the blank-chart bug on Chrome 118. Root cause is a stale useMemo dependency in the chart wrapper — re-render does not pick up the new data prop.')" >/dev/null 2>&1
$AB screenshot /tmp/render/06b-action-filled.png >/dev/null 2>&1
$AB find role button click --name "Record action" >/dev/null 2>&1
sleep 1
$AB screenshot /tmp/render/07-action-recorded.png >/dev/null 2>&1
echo "[verify] 07-action-recorded (Demo 2)"

# Demo 3: Edit -> status Pending -> Completed + resolution
$AB find text "Edit" click >/dev/null 2>&1
sleep 1
$AB screenshot /tmp/render/08-edit-form.png >/dev/null 2>&1
# Status select: it's the 3rd select in the drawer (Category, Priority, Status)
$AB eval "var sels=document.querySelectorAll('.drawer select'); var s=[...sels].find(el=>[...el.options].some(o=>o.text==='Completed')); s.value=[...s.options].find(o=>o.text==='Pending').value; s.dispatchEvent(new Event('change',{bubbles:true})); 'ok'" >/dev/null 2>&1
$AB find role button click --name "Save changes" >/dev/null 2>&1
sleep 1
# Now set to Completed (resolution note field appears)
$AB eval "var sels=document.querySelectorAll('.drawer select'); var s=[...sels].find(el=>[...el.options].some(o=>o.text==='Completed')); s.value=[...s.options].find(o=>o.text==='Completed').value; s.dispatchEvent(new Event('change',{bubbles:true})); 'ok'" >/dev/null 2>&1
sleep 1
$AB screenshot /tmp/render/09-completed-resolution.png >/dev/null 2>&1
echo "[verify] 09-completed-resolution (resolution field shown)"
$AB eval "$SETJS setV('textarea[placeholder*=\"Describe how the case\"]','Fixed by adding the missing useMemo deps to the chart component; verified across 5 dashboards in staging and added a regression test.')" >/dev/null 2>&1
$AB find role button click --name "Save changes" >/dev/null 2>&1
sleep 1
$AB screenshot /tmp/render/10-status-completed.png >/dev/null 2>&1
echo "[verify] 10-status-completed (Demo 3)"
$AB find text "History" click >/dev/null 2>&1
sleep 1
$AB screenshot /tmp/render/11-history-timeline.png >/dev/null 2>&1
echo "[verify] 11-history-timeline (immutable log)"

# Demo 4: Dashboard now reflects the new case + actions
$AB open http://127.0.0.1:5000/ >/dev/null 2>&1
$AB wait --load networkidle >/dev/null 2>&1
sleep 1
$AB screenshot --full /tmp/render/12-overview-updated.png >/dev/null 2>&1
$AB snapshot -c 2>&1 | grep -iE "TOTAL CASES|ACTIVE|COMPLETED CASES|OVERDUE|ACTIONS RECORDED" -A1 | head -12
echo "[verify] 12-overview-updated (Demo 4)"

# Demo 5: Productivity report
$AB open http://127.0.0.1:5000/reports >/dev/null 2>&1
$AB wait --load networkidle >/dev/null 2>&1
sleep 1
$AB screenshot --full /tmp/render/13-productivity.png >/dev/null 2>&1
$AB snapshot -c 2>&1 | grep -iE "Cases Created|Cases Completed|Total Actions|Avg Completion" | head -8
echo "[verify] 13-productivity (Demo 5)"

# Remaining pages
for p in team:14-team all-cases:15-all-cases activity-logs:16-activity-logs my-cases:17-my-cases settings:18-settings; do
  path=${p%%:*}; out=${p##*:}
  $AB open http://127.0.0.1:5000/$path >/dev/null 2>&1
  $AB wait --load networkidle >/dev/null 2>&1
  sleep 1
  $AB screenshot --full /tmp/render/$out.png >/dev/null 2>&1
  echo "[verify] $out"
done

echo "=== page errors ==="
$AB errors 2>&1 | head -20
$AB close >/dev/null 2>&1
kill -9 $FPID 2>/dev/null
echo "=== screenshots ==="
ls /tmp/render/ | wc -l
ls -la /tmp/render/ | awk '{print $5, $9}' | tail -30