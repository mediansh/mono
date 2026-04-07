#!/usr/bin/env bash
# Linear API helper script for Claude Code
# Targets the "Median" Linear team.
# Usage:
#   ./scripts/linear.sh create "Fix auth bug" [description] [priority]
#   ./scripts/linear.sh update MED-123 "in_progress"|"todo"|"done"|"cancelled"
#   ./scripts/linear.sh list
#
# Requires LINEAR_API_KEY in environment or .env.local

LINEAR_TEAM_NAME="Median"

set -euo pipefail

# Load .env.local if present
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env.local"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC2046
  export $(grep -E '^LINEAR_API_KEY=' "$ENV_FILE" | xargs) 2>/dev/null || true
fi

if [[ -z "${LINEAR_API_KEY:-}" ]]; then
  echo "Error: LINEAR_API_KEY is not set."
  echo "Add it to .env.local:  LINEAR_API_KEY=lin_api_xxxx"
  exit 1
fi

LINEAR_API="https://api.linear.app/graphql"

gql() {
  curl -sf -X POST "$LINEAR_API" \
    -H "Authorization: ${LINEAR_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$1"
}

# Get the Median team ID
get_team_id() {
  gql '{"query":"{ teams { nodes { id name } } }"}' \
    | python3 -c "
import sys, json
d = json.load(sys.stdin)
teams = d['data']['teams']['nodes']
match = next((t for t in teams if t['name'] == '$LINEAR_TEAM_NAME'), None)
if not match:
    print(f'Error: Linear team \"$LINEAR_TEAM_NAME\" not found. Available: ' + ', '.join(t[\"name\"] for t in teams), file=sys.stderr)
    sys.exit(1)
print(match['id'])
"
}

# Get workflow state ID by type name (e.g. "in_progress", "done")
get_state_id() {
  local team_id="$1"
  local state_type="$2"

  # Map friendly names to Linear state types
  case "$state_type" in
    in_progress|inprogress|started) state_type="started" ;;
    todo|backlog)                   state_type="unstarted" ;;
    done|completed|complete)        state_type="completed" ;;
    cancelled|canceled)             state_type="cancelled" ;;
  esac

  gql "{\"query\":\"{ team(id: \\\"$team_id\\\") { states { nodes { id type } } } }\"}" \
    | python3 -c "
import sys, json
d = json.load(sys.stdin)
states = d['data']['team']['states']['nodes']
match = next((s for s in states if s['type'] == '$state_type'), None)
if match:
    print(match['id'])
else:
    print('')
"
}

cmd="${1:-help}"

case "$cmd" in
  create)
    title="${2:-}"
    description="${3:-}"
    priority="${4:-0}"  # 0=no priority, 1=urgent, 2=high, 3=medium, 4=low

    if [[ -z "$title" ]]; then
      echo "Usage: $0 create \"Issue title\" [description] [priority 0-4]"
      exit 1
    fi

    team_id="$(get_team_id)"
    escaped_title="${title//\"/\\\"}"
    escaped_desc="${description//\"/\\\"}"

    payload="{\"query\":\"mutation { issueCreate(input: { teamId: \\\"$team_id\\\", title: \\\"$escaped_title\\\", description: \\\"$escaped_desc\\\", priority: $priority }) { success issue { id identifier title url } } }\"}"

    result="$(gql "$payload")"
    echo "$result" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if d.get('data', {}).get('issueCreate', {}).get('success'):
    i = d['data']['issueCreate']['issue']
    print(f\"Created: {i['identifier']} - {i['title']}\")
    print(f\"URL: {i['url']}\")
    print(i['identifier'])
else:
    print('Error:', json.dumps(d))
    sys.exit(1)
"
    ;;

  update)
    issue_id="${2:-}"
    new_state="${3:-}"

    if [[ -z "$issue_id" || -z "$new_state" ]]; then
      echo "Usage: $0 update LIN-123 todo|in_progress|done|cancelled"
      exit 1
    fi

    # Resolve issue numeric ID from identifier (e.g. LIN-123)
    escaped_id="${issue_id//\"/\\\"}"
    issue_data="$(gql "{\"query\":\"{ issue(id: \\\"$escaped_id\\\") { id team { id } } }\"}")"
    numeric_id="$(echo "$issue_data" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['issue']['id'])")"
    team_id="$(echo "$issue_data" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['issue']['team']['id'])")"

    state_id="$(get_state_id "$team_id" "$new_state")"
    if [[ -z "$state_id" ]]; then
      echo "Error: could not find state '$new_state'"
      exit 1
    fi

    result="$(gql "{\"query\":\"mutation { issueUpdate(id: \\\"$numeric_id\\\", input: { stateId: \\\"$state_id\\\" }) { success issue { identifier title } } }\"}")"
    echo "$result" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if d.get('data', {}).get('issueUpdate', {}).get('success'):
    i = d['data']['issueUpdate']['issue']
    print(f\"Updated: {i['identifier']} → $new_state\")
else:
    print('Error:', json.dumps(d))
    sys.exit(1)
"
    ;;

  list)
    team_id="$(get_team_id)"
    gql "{\"query\":\"{ team(id: \\\"$team_id\\\") { issues(first: 20, orderBy: updatedAt) { nodes { identifier title state { name } priority } } } }\"}" \
      | python3 -c "
import sys, json
d = json.load(sys.stdin)
issues = d['data']['team']['issues']['nodes']
for i in issues:
    p = ['', 'Urgent', 'High', 'Medium', 'Low'][i['priority']] if i['priority'] else '-'
    print(f\"{i['identifier']:<12} [{i['state']['name']:<12}] [{p:<6}] {i['title']}\")
"
    ;;

  *)
    echo "Linear API helper"
    echo ""
    echo "Usage:"
    echo "  $0 create \"Issue title\" [description] [priority 0-4]"
    echo "  $0 update LIN-123 todo|in_progress|done|cancelled"
    echo "  $0 list"
    echo ""
    echo "Set LINEAR_API_KEY in .env.local"
    ;;
esac
