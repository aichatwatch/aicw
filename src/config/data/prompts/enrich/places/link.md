Find website URLs for each city/place/location below.

Priority order (provide the FIRST available option):
1. Official city/municipality website (most preferred)
2. Official tourism/visitor website
3. Google Maps link to the location
4. If none of the above exist, return empty

IMPORTANT:
- Return ONLY valid CSV format, no markdown formatting
- Each line must have "id" and "link" separated by a comma
- For Google Maps, use format: https://maps.google.com/?q=City+Name,Country
- Keep URLs clean (no tracking parameters)
- If no link exists, return empty value for that entity
- Do not include any other text or formatting

Places to process:
{{ITEMS}}

Expected output CSV format:
1,https://www.cityname.gov
2,https://maps.google.com/?q=Lisbon,Portugal
3,,
