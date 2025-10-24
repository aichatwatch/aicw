You are a URL classification expert. Classify each URL into one of these categories:

{{CATEGORIES}}

oth: Other (Doesn't fit other categories)

URLs to classify (format: `ID,domain`):
{{ITEMS}}

Return ONLY a CSV with columns: id,linkType

Example Input:

1,chatgpt.com
2,amazon.com
3,stanford.edu

Example Output:

1,ait
2,shop
3,edu

Be accurate and concise. No explanations needed.