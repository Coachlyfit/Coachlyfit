// ponytail: identical shape to join/[token]/schemas.ts (fullName/email/password) --
// team invites collect the same fields as client invites, so we re-export instead
// of duplicating. Precedent for this kind of cross-leaf-folder import within a
// route group: e.g. programs/[programId]/exercise-sidebar.tsx importing
// ../../library/actions.
export { joinSchema, type JoinInput } from "../../join/[token]/schemas";
