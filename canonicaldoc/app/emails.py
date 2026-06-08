"""Transactional email via Resend.

In dev (`EMAIL_ENABLED=false`) nothing is sent over the network — magic links
and invites are printed to the console so you can copy them into a browser. In
production set `EMAIL_ENABLED=true`, `RESEND_API_KEY` and `EMAIL_FROM`.
"""
import resend

from app.config import settings


def send_magic_link(to: str, link: str) -> None:
    if not settings.EMAIL_ENABLED:
        _print_dev("MAGIC LINK", to, link)
        return
    mins = settings.MAGIC_TOKEN_TTL_MINUTES
    _send(
        to,
        "Your CanonicalDoc sign-in link",
        _layout(
            "Sign in to CanonicalDoc",
            f"Click the button below to sign in. This link expires in "
            f"{mins} minutes and can only be used once.",
            "Sign in",
            link,
        ),
    )


def send_invite(to: str, team_name: str, login_url: str) -> None:
    if not settings.EMAIL_ENABLED:
        _print_dev(f"INVITE to {team_name}", to, login_url)
        return
    _send(
        to,
        f"You're invited to {team_name} on CanonicalDoc",
        _layout(
            f"You've been invited to {team_name}",
            f"{team_name} keeps its canonical doc — the one place with everything "
            f"the team needs to know — on CanonicalDoc. Sign in with this email "
            f"address ({to}) to get access.",
            "Open CanonicalDoc",
            login_url,
        ),
    )


# ---------- internals ----------

def _send(to: str, subject: str, html: str) -> None:
    if not settings.RESEND_API_KEY:
        raise RuntimeError("EMAIL_ENABLED is true but RESEND_API_KEY is not set")
    resend.api_key = settings.RESEND_API_KEY
    resend.Emails.send(
        {
            "from": settings.EMAIL_FROM,
            "to": [to],
            "subject": subject,
            "html": html,
        }
    )


def _layout(heading: str, body: str, cta_label: str, cta_url: str) -> str:
    """A minimal monochrome HTML email matching the CanonicalDoc brand."""
    return f"""\
<div style="background:#ffffff;padding:40px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif;color:#141414">
  <div style="max-width:440px;margin:0 auto">
    <h1 style="font-size:22px;font-weight:600;letter-spacing:-0.5px;margin:0 0 16px">{heading}</h1>
    <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 28px">{body}</p>
    <a href="{cta_url}" style="display:inline-block;background:#141414;color:#ffffff;text-decoration:none;font-size:15px;font-weight:500;padding:12px 22px;border-radius:8px">{cta_label}</a>
    <p style="font-size:13px;line-height:1.6;color:#999;margin:28px 0 0">If the button doesn't work, copy and paste this link:<br>
      <a href="{cta_url}" style="color:#141414;word-break:break-all">{cta_url}</a></p>
    <p style="font-size:12px;color:#bbb;margin:32px 0 0">CanonicalDoc — one doc, the whole truth.</p>
  </div>
</div>"""


def _print_dev(kind: str, to: str, link: str) -> None:
    print("\n" + "=" * 70)
    print(f"  {kind} for {to}:")
    print(f"  {link}")
    print("=" * 70 + "\n", flush=True)
