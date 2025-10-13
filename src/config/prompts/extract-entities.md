# THE INSTRUCTION TO STRICTLY FOLLOW WHEN GENERATING OUTPUT:

INSTRUCTION: Please generate the JS code content as output based on the following guidelines:

1. Start with the `output` object structure.
2. Include all necessary fields like report_question, report_date and others.
3. Strictly follow the instructions below which starts with the "INSTRUCTION:" keyword.
4. Format the output as valid JavaScript, with proper indentation.
5. Do not include any comments (i.e. /* */) in the output!

**CRITICAL: Your output must be RAW JavaScript code ONLY. Do NOT include any markdown formatting like ```javascript or ``` or any other code block markers. Start directly with the JavaScript code.**

Please generate the content following these guidelines, maintaining the overall structure and purpose of the output JS code without any starting ``` or ending ```.

START OF THE JS OUTPUT TEMPLATE:

output = {

/* INSTRUCTION: You will need to extract list of keywords, organizations, concepts, persons, products, locations and sources from the bot answers below. Keep track of any issues with data quality or completeness. For each section (summary, organizations, concepts, persons, products, locations, sources), follow these guidelines:

1. When extractting data use ONLY the information provided in the bot answers from the `ANSWERS_FROM_BOTS` section. Do not include any information from other parts of the prompt in this list. 

2. Only extract information that is explicitly mentioned in the bot answers. Do not infer or assume any information.

3. Again, accuray is crucial. Only attribute keywords, persons, organizations, products, concepts, locations or information to bots that explicitly mention them in their responses. Do not infer or assume any information. If in doubt, it's better to omit than to incorrectly attribute.

4. For entities (persons, organizations, products, etc.) that are mentioned multiple times with slight variations in name, use the most common or complete version of the name but it must be explictely mentioned in original answers.

5. After creating all entries, perform a final cross-check of each entry against all bot responses to ensure accuracy and completeness.

Additional instructions for each section will follow. Do NOT include this instruction in the output!
*/

"products": [
/* INSTRUCTION: Analyze each answer from the `ANSWERS_FROM_BOTS` section individually. 

1. For each answer, identify any and all products that are explicitly mentioned and list them in the output array as the following: 

   [
    "Product1Name", // as mentioned in answers
    "Product2Name", // ase mentioned in answers
   ... // more products mentioned in answers
   ]


IMPORTANT: 
- Do not infer, extrapolate, or assume any products. Only include those that are explicitly mentioned in at least one bot's answer.
- For products mentioned multiple times with slight variations in name, use the most common or complete version of the name but it must be explictely mentioned in original answers.
- Do NOT use any example products from the instructions. Only extract products actually mentioned in the bot answers.

After creating all entries, perform a final cross-check of each entry against all bot responses to ensure accuracy and completeness.
Do NOT include this instruction in the output!
*/
],

"organizations": [
/* INSTRUCTION: Analyze each answer from the `ANSWERS_FROM_BOTS` section individually. 

1. For each answer, identify all company/organization or legal entities names that are explicitly mentioned.

2. Format each verified entry as follows:
   [
    "Company1Name", // as mentioned in answers
   "Company2Name" // as mentioned in answers 
    .. // more companies mentioned
   ],

IMPORTANT:
- Only include organizations explicitly mentioned in the bot answers
- Do NOT use any example organizations from the instructions
- Do NOT include this instruction in the output!
*/
],

"persons": [
/* INSTRUCTION: Extract and normalize persons data from bot responses following the rules explained previously.

Format each verified entry as follows:
       [
         "Person1 Full Name",    // As mentioned in text
         "Person 2 Full Name",   // As mentioned in text
         .. // more persons
       ]

    FORBIDDEN:
    × No inference of unnamed persons
    × No inclusion of generic teams/groups
    × No fabrication of names!
    × Do NOT use any example persons from the instructions
    * Do NOT include this instruction in the output!
    */
],   

"places": [
/* INSTRUCTION: Extract and normalize names of places from bot responses following the rules explained previously.

OUTPUT FORMAT
       [
         "Place1Name",    // As mentioned in answers
         "Place2Name", // as mentioned in answers
         .. // more places names as mentioned in answers
       ]

IMPORTANT:
- Only include places explicitly mentioned in the bot answers
- Do NOT use any example places from the instructions

    */
],   

"events": [
/* INSTRUCTION: Extract and normalize names of events  from bot responses following the rules explained previously.

OUTPUT FORMAT
       [
         "Event1 Name",    // As mentioned in answers
         "event2 Name",   // As mentioned in answers
         .. // more event names as mentio in answers
       ]

IMPORTANT:
- Do Only include events explicitly mentioned in the bot answers
- Do NOT use any example events from the instructions

    */
],   

"keywords": [
/*
INSTRUCTION: Review answers from `ANSWERS_FROM_BOTS` section and extract up to 50 keywords, actions, concepts, ideas and phrases from bot responses following the rules explained previously.

OUTPUT FORMAT:

`[ "Exact keyword/concept/idea/action/phrase", "another exact mentioned keyword/concept/idea/action/phrase", ...]

IMPORTANT:
- Only extract keywords/concepts actually mentioned in the bot answers
- Do NOT use any example keywords from the instructions
*/
]

}

# `ANSWERS_FROM_BOTS` section:

Listed below are the answers provided by different online AI chats for the following question: `{{REPORT_QUESTION}}`.

Each bot's answer is in a single `ANSWER` section and looks like this:
```
ANSWER FROM `brave_search`: 
```

{{ANSWERS}}