Find website URLs for each event below

Priority order (provide the FIRST available option):
1. Official event website (most preferred)
2. Official event website
3. Social network link to the event
4. If none of the above exist, return empty

IMPORTANT:
- Return ONLY valid CSV format, no markdown formatting
- Each line must have "id" and "link" separated by a comma
- Keep URLs clean (no tracking parameters)
- If no link exists, return empty value for that entity
- Do not include any other text or formatting

Events to process:
{{ITEMS}}

Expected output CSV format:
1,https://www.eventname.com
2,https://instagram.com/someevent/post
3,,
