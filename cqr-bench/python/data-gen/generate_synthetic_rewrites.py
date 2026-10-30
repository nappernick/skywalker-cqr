import json
import boto3
import os

# Set up Bedrock runtime client
# Requires AWS credentials with access to Bedrock models
bedrock_client = boto3.client('bedrock-runtime', region_name=os.getenv('AWS_REGION', 'us-west-2'))

# We use Claude 3.5 Sonnet to generate the synthetic training data
MODEL_ID = "anthropic.claude-3-5-sonnet-20241022-v2:0"

SYSTEM_PROMPT = """
You are a synthetic data generation assistant for a Conversational RAG system.
Your goal is to generate pairs of multi-turn user queries, specifically simulating a follow-up question.
The follow-up question must contain ellipsis (missing subjects), anaphora (pronouns), or topic shifts.

For each pair, you must generate the "gold standard" structured JSON resolution.
The output format must be EXACTLY valid JSON matching this schema:
{
  "query": "The fully resolved, standalone query string without any pronouns.",
  "filters": {
    "domain": "The domain of the query (e.g. 'expense', 'hr', 'it')",
    "subject": "The primary subject (e.g. 'lodging', 'software', 'payroll')"
  }
}

Do not output anything other than the JSON object.
"""

def generate_synthetic_example(context_topic: str) -> dict:
    prompt = f"Generate a conversational turn regarding the topic: {context_topic}.\n\n" \
             "Format output as a single JSON object containing 'previous_turn', 'follow_up_turn', and 'gold_resolution' which contains the schema defined in the system prompt."
    
    messages = [
        {"role": "user", "content": prompt}
    ]
    
    body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 1000,
        "system": SYSTEM_PROMPT,
        "messages": messages,
        "temperature": 0.7
    })
    
    response = bedrock_client.invoke_model(
        modelId=MODEL_ID,
        body=body
    )
    
    response_body = json.loads(response.get('body').read())
    content = response_body.get('content')[0].get('text')
    
    try:
        # Claude might wrap JSON in markdown blocks
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        return json.loads(content)
    except Exception as e:
        print(f"Failed to parse generation: {content}")
        return None

if __name__ == "__main__":
    # Example generation loop
    topics = ["international hotel reimbursement limits", "laptop replacement cycle", "parental leave policy"]
    results = []
    
    for topic in topics:
        print(f"Generating example for: {topic}")
        example = generate_synthetic_example(topic)
        if example:
            results.append(example)
            
    with open('synthetic_eval_set.jsonl', 'w') as f:
        for r in results:
            f.write(json.dumps(r) + "\n")
    print("Done generating synthetic eval set.")
