// Simple, dependency-free password strength check.
// Enforced client-side for UX; the real floor (min length) is also
// enforced server-side by Supabase Auth's password policy settings.
export function scorePassword(pw) {
  if (!pw) return { score: 0, label: "", checks: {} };

  const checks = {
    length: pw.length >= 8,
    lower: /[a-z]/.test(pw),
    upper: /[A-Z]/.test(pw),
    number: /[0-9]/.test(pw),
    special: /[^A-Za-z0-9]/.test(pw),
  };

  const passed = Object.values(checks).filter(Boolean).length;
  let score;
  if (pw.length < 8) score = 0;
  else if (passed <= 2) score = 1;
  else if (passed <= 4) score = 2;
  else score = 3;

  const label = ["Too weak", "Weak", "Okay", "Strong"][score];
  return { score, label, checks };
}

export function passwordMeetsMinimum(pw) {
  return scorePassword(pw).score >= 2; // require at least "Okay"
}
