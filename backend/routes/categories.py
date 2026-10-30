"""Categories endpoints — lookup table for case categories (PS-02 Round 2).

The `default_priority` column is the source of truth for category-based
automatic priority assignment. The frontend reads it to display the
auto-calculated priority in the Create Case form; the backend reads it on
case create/update to set the priority (the client cannot set priority).

Includes a keyword-based category detection endpoint that analyses a case
title and returns the best-matching category + its default_priority. The
detection uses weighted keyword matching (not exact match) so common
customer complaint phrases like "can't log in" or "payment failed" resolve
correctly.
"""
from flask import Blueprint, request, jsonify
import database as db
from auth import require_auth, require_role
import re

categories_bp = Blueprint("categories", __name__)

VALID_PRIORITIES = ["Low", "Medium", "High", "Critical"]

# Keyword → category mapping. Each entry is a list of keywords/phrases that
# should map to the category. The detector normalises the title (lowercase,
# strip) and checks how many keywords match — the category with the highest
# weighted score wins. Keywords can be multi-word phrases.
CATEGORY_KEYWORDS = {
    "Billing": [
        "payment", "invoice", "billing", "charge", "charged", "refund",
        "transaction", "card", "deducted", "subscription", "price",
        "receipt", "amount", "overcharged", "double charge", "refund not received",
        "payment failed", "transaction failed", "order not confirmed",
    ],
    "Technical Support": [
        "crash", "crashes", "error", "bug", "slow", "loading", "timeout",
        "broken", "not working", "website", "application", "app", "server",
        "500", "502", "503", "page not found", "checkout", "loading slowly",
        "application crashes", "website loading", "integration",
    ],
    "Account Access": [
        "login", "log in", "log-in", "signin", "sign in", "sign-in",
        "password", "access", "account", "locked", "reset", "forgot",
        "otp", "two-factor", "2fa", "sso", "saml", "unauthorized",
        "cannot access", "unable to access", "unable to log in",
        "account locked", "password reset", "forgot password",
    ],
    "Onboarding": [
        "onboard", "onboarding", "setup", "provision", "new customer",
        "getting started", "welcome", "activate", "activation",
    ],
    "Feature Request": [
        "feature", "request", "enhancement", "suggestion", "would be nice",
        "add support", "new feature", "improve", "upgrade", "dark mode",
    ],
    "Bug Report": [
        "bug", "defect", "wrong", "incorrect", "typo", "display",
        "date picker", "ui bug", "visual", "misaligned", "spelling",
    ],
    "Data Migration": [
        "migrate", "migration", "import", "export", "transfer",
        "bulk", "csv", "data transfer", "move data", "zendesk",
    ],
    "Compliance": [
        "gdpr", "compliance", "legal", "audit", "data export request",
        "privacy", "data protection", "regulatory", "subject access",
        "suspicious", "security", "breach", "incident", "critical incident",
        "suspicious login", "unauthorized access", "hacked",
    ],
}


def _normalise(text):
    """Lowercase + collapse whitespace for matching."""
    return re.sub(r'\s+', ' ', (text or '').lower().strip())


def _score_category(title_lower, keywords):
    """Score a category by counting keyword hits. Multi-word phrases get
    a higher weight (2) than single words (1)."""
    score = 0
    for kw in keywords:
        kw_lower = kw.lower()
        if kw_lower in title_lower:
            # Multi-word phrase = stronger signal
            weight = 2 if ' ' in kw_lower else 1
            score += weight
    return score


@categories_bp.route("/detect", methods=["POST"])
@require_auth
def detect_category():
    """Analyse a case title and return the best-matching category +
    its default_priority. Uses weighted keyword matching — not exact.
    Returns {"category": name, "priority": ..., "confidence": "high"/"low"/"none"}
    or {"category": null, "confidence": "none"} if no match."""
    data = request.get_json(force=True) or {}
    title = (data.get("title") or "").strip()
    if not title or len(title) < 3:
        return jsonify({"category": None, "priority": None, "confidence": "none"})

    title_lower = _normalise(title)
    scores = {}
    for cat_name, keywords in CATEGORY_KEYWORDS.items():
        s = _score_category(title_lower, keywords)
        if s > 0:
            scores[cat_name] = s

    if not scores:
        return jsonify({"category": None, "priority": None, "confidence": "none"})

    # Pick the highest-scoring category
    best_cat = max(scores, key=scores.get)
    best_score = scores[best_cat]
    # Confidence: "high" if score >= 2, "low" if score == 1
    confidence = "high" if best_score >= 2 else "low"

    # Look up the category's default_priority from the DB
    row = db.fetch_one("SELECT default_priority FROM categories WHERE name=%s", (best_cat,))
    priority = row["default_priority"] if row else "Medium"

    return jsonify({
        "category": best_cat,
        "priority": priority,
        "confidence": confidence,
        "scores": scores,
    })


@categories_bp.route("", methods=["GET"])
@require_auth
def list_categories():
    rows = db.fetch_all(
        "SELECT category_id, name, default_priority, description FROM categories ORDER BY name")
    return jsonify({"categories": rows})


@categories_bp.route("", methods=["POST"])
@require_role("Admin")
def create_category():
    data = request.get_json(force=True) or {}
    name = (data.get("name") or "").strip()
    desc = (data.get("description") or "").strip() or None
    default_priority = (data.get("default_priority") or "Medium").strip()
    if not name:
        return jsonify({"error": "Category name is required"}), 400
    if default_priority not in VALID_PRIORITIES:
        return jsonify({"error": "Invalid default_priority"}), 400
    if db.fetch_one("SELECT category_id FROM categories WHERE name=%s", (name,)):
        return jsonify({"error": "Category already exists"}), 409
    cid, _ = db.execute(
        "INSERT INTO categories (name, default_priority, description) VALUES (%s, %s, %s)",
        (name, default_priority, desc))
    return jsonify({"category_id": cid, "name": name, "default_priority": default_priority, "description": desc}), 201
