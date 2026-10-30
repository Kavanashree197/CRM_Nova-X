// Immutable action-log writer — mirrors backend/activity.py from the Flask app.
// Rows are only ever inserted here, never updated or deleted.
import { db } from "./db";

export const activity = {
  async log(caseId: number, userId: number, actionType: string, description: string,
            previousValue: string | null = null, newValue: string | null = null) {
    return db.caseAction.create({
      data: { caseId, userId, actionType, description,
              previousValue: previousValue === null ? null : String(previousValue),
              newValue: newValue === null ? null : String(newValue) },
    });
  },
};

// Re-export constants for convenience
export { VALID_STATUSES, VALID_PRIORITIES, VALID_CATEGORIES } from "./auth";
