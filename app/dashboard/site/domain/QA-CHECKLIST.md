# Domain save + verification regression checklist

1. Open a site's **Domain** settings and enter a custom domain that does **not** yet pass verification.
2. Click **Save changes**.
3. Confirm the domain remains saved on reload (it appears in the domain row / input value).
4. Confirm the dashboard shows a non-blocking warning with verification guidance (record guide + revalidate button).
5. Request the site using that custom domain once DNS is correctly routed to Blot and confirm the published site renders.
6. Confirm the request above does **not** show `error-almost-connected.html` solely because a previous verification attempt failed.
