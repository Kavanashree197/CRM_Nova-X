import React from 'react'
import { useNavigate } from 'react-router-dom'
import { IconShield, IconCheck, IconAlert, IconLayers } from '../components/icons'

const PROTECTIONS = [
  {
    icon: IconAlert,
    title: 'Meaningless action prevention',
    body: 'Simply opening or viewing a case is never counted as an action. Only meaningful action types — Contacted, Investigation Started, Information Requested, Follow-up Scheduled, Internal Discussion, Issue Resolved — are recorded, and each one requires a description before it is saved.',
    detail: 'Why it matters: prevents inflating contribution counts with passive views.',
  },
  {
    icon: IconCheck,
    title: 'Premature closure prevention',
    body: 'A case cannot be marked Completed without a resolution note. The backend rejects the status change if the note is empty, so an unresolved case can never be silently closed. Reopening a completed case keeps the prior completion entry visible in the history timeline.',
    detail: 'Why it matters: stops cases from being closed just to hit a target.',
  },
  {
    icon: IconLayers,
    title: 'Contribution preservation',
    body: 'When a case is reassigned, every action and assignment the previous resource recorded stays in the immutable activity log and audit trail — attached to that person, with the original timestamp. The new assignee does not inherit the credit, and the previous contributor does not lose it.',
    detail: 'Why it matters: reassignment never erases earlier work, so productivity reports stay fair.',
  },
]

export default function TrustFairness() {
  const nav = useNavigate()
  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Trust & Fairness</div>
          <div className="page-sub">How this CRM keeps employee contribution data honest. The brochure highlights that employees are judged using the data they enter — these protections make that judgement defensible.</div>
        </div>
      </div>

      <div className="card card-pad" style={{ maxWidth: 820 }}>
        <div className="flex gap-12 items-center">
          <div className="kpi-ic" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', width: 44, height: 44 }}>
            <IconShield size={22} />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Our commitment</div>
            <div className="text-sm muted" style={{ marginTop: 2 }}>
              We do not claim manipulation is impossible. These three protections make the data
              trustworthy enough that employees, team leads and management can rely on the same
              numbers.
            </div>
          </div>
        </div>
      </div>

      <div className="grid mt-16" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {PROTECTIONS.map((p, i) => {
          const Icon = p.icon
          return (
            <div className="card card-pad" key={i}>
              <div className="kpi-ic" style={{ background: 'var(--st-done-bg)', color: 'var(--st-done)', width: 38, height: 38 }}>
                <Icon size={20} />
              </div>
              <div style={{ fontWeight: 600, fontSize: 14, marginTop: 10 }}>{p.title}</div>
              <div className="text-sm" style={{ color: 'var(--text-2)', marginTop: 6, lineHeight: 1.55 }}>{p.body}</div>
              <div className="text-xs muted" style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>{p.detail}</div>
            </div>
          )
        })}
      </div>

      <div className="card card-pad mt-16" style={{ maxWidth: 820 }}>
        <div className="section-title" style={{ marginTop: 0 }}>Where these protections live in the code</div>
        <ul style={{ margin: '4px 0 0 0', paddingLeft: 18, color: 'var(--text-2)', fontSize: 13, lineHeight: 1.8 }}>
          <li><b>Backend validation</b> — <code className="mono">routes/cases.py</code> rejects <code className="mono">status=Completed</code> without a non-empty <code className="mono">resolution_note</code>.</li>
          <li><b>Immutable logs</b> — <code className="mono">case_actions</code> and <code className="mono">audit_logs</code> rows are append-only; no UPDATE or DELETE endpoint exists.</li>
          <li><b>Reassignment history</b> — <code className="mono">case_assignments</code> stores every assignee with timestamp + author; old rows are never overwritten.</li>
          <li><b>Status history</b> — <code className="mono">case_status_history</code> records every status transition with who/when/why.</li>
        </ul>
      </div>
    </div>
  )
}
