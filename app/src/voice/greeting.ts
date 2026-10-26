// What Mika says out loud when the app opens. Picked on the phone so the
// greeting is instant and doesn't need a call to Claude.
export function greeting(name: string, now: Date = new Date(), pick: number = Math.random()): string {
  const hour = now.getHours();
  const hello = hour < 5 ? "Hey, you're up late" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const who = name.trim() ? `, ${name.trim().split(/\s+/)[0]}` : "";
  const prompts = [
    "What's on your mind?",
    "What would you like to plan?",
    "How's your day going?",
    "I'm listening whenever you're ready.",
  ];
  return `${hello}${who}! ${prompts[Math.floor(pick * prompts.length) % prompts.length]}`;
}
