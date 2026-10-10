// Fix-card text, keyed by messageKey (SPEC.md B5 and Module E). {placeholders} are filled by fill().
// A key ending in "_audio" is the face-missing version of the same key: it names both possible causes.

export const MESSAGES: Record<string, { title: string; text: string }> = {
  // Tone (pitch)
  no_pitch: { title: "I couldn't hear the pitch", text: "I couldn't hear a clear pitch. Try again a bit louder." },
  wrong_tone: { title: "Sounded like tone {heard}", text: "That sounded like tone {heard}. Aim for tone {tone}: listen once more, then copy the shape." },
  wrong_tone_sandhi: { title: "This tone changes here", text: "In this word the tone changes ({note}), so say it as tone {tone}, not tone {heard}." },
  t1_drift: { title: "Keep tone 1 flat", text: "Keep it flat; your tone 1 slid {dir}." },
  t1_low: { title: "Start tone 1 higher", text: "Tone 1 sits at the top of your voice. Start higher." },
  t2_shallow: { title: "Rise more", text: "Rise more: from the middle of your voice to the top." },
  t2_late: { title: "Rise right away", text: "You dipped before rising, which sounds like tone 3. Start rising right away." },
  t3_not_low: { title: "Go lower", text: "Go lower. Tone 3 lives at the bottom of your voice." },
  t3_full_in_context: { title: "Tone 3 can stay low here", text: "Mid-phrase, tone 3 just stays low. No need to rise at the end." },
  t4_shallow: { title: "Fall further", text: "Fall further, from top to bottom, like a firm \"No!\"" },
  t4_low_start: { title: "Start tone 4 higher", text: "Start tone 4 higher." },
  // Vowels (lips and tongue)
  y_glide: { title: "Hold one mouth shape", text: "Don't slide like English \"you\". Hold one mouth shape from start to end." },
  y_lips_not_rounded: { title: "Round your lips", text: "Keep your tongue exactly as for \"ee\". Now push your lips into a small, tight circle." },
  y_lips_not_rounded_audio: { title: "Round your lips", text: "Sounded like \"ee\": round your lips, keep your tongue forward." },
  y_tongue_back: { title: "Keep your tongue forward", text: "Your lips are right. Your tongue slid back to \"oo\": keep the tip touching your lower front teeth." },
  y_both: { title: "Start from \"ee\"", text: "Start from \"ee\", hold your tongue still, then round your lips." },
  y_ok_lips_hint: { title: "Round a little more", text: "Sounds right. Rounding your lips more will make it steadier." },
  u_fronted: { title: "Pull your tongue back", text: "Round tighter and pull your tongue back, deeper than English \"oo\"." },
  i_rounded: { title: "Spread your lips", text: "Spread your lips, like a slight smile." },
};

/** Low-confidence vowel verdicts get this in front (SPEC.md C5: word the fix more cautiously). */
export const CAUTIOUS = "It's a close call, but try this: ";

export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (all, key: string) => String(vars[key] ?? all));
}
