// Explicit allowlist: adding fields to the model cannot expose them through auth.
export function safeProfile(user) {
  return { _id: String(user._id), name: user.name, email: user.email, role: user.role, createdAt: user.createdAt };
}
