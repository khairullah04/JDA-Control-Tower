// Read next to this file, so the tracker's modules find it from any page that uses them (the tracker
// itself, and the JDA Control Tower landing page, which runs the tracker's Drive sync and cost figures).
export const config = await (await fetch(new URL('./app-config.json', import.meta.url))).json();
