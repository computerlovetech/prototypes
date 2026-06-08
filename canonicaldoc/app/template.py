CANONICAL_TEMPLATE = """# {company} — Canonical Doc

> The one and only document with everything the team needs to know.
> Where to find out what you need to know? Here.

## Vision
_Why we exist and where we're going. One paragraph._

## Strategy
_How we get there. The few things that matter most right now._

## Roles & Owners
_Who owns what. Every area of work has exactly one owner._

| Workstream | Owner |
| --- | --- |
|  |  |

## OKRs
_Objectives and key results for this quarter._

### Objective 1:
- KR1:
- KR2:

## People
_Everyone on the team and what they do._

## Nomenclature
_Shared vocabulary. Same words, same meaning._

| Term | Definition |
| --- | --- |
|  |  |

## Links
_Everything downstream lives here._
"""


def starter_body(company: str) -> str:
    return CANONICAL_TEMPLATE.format(company=company)
