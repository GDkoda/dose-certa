<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Subscribe React store consumers to the stable full-state snapshot and apply selectors afterward; allocating filtered arrays inside getSnapshot causes render loops after sign-in.
- Account identity uses Cloud Auth with normalized usernames mapped to synthetic addresses; do not trust legacy localStorage credentials or roles because accounts and permissions must work across devices.
- Store roles separately in user_roles and validate Master mutations on the server; client role checks only control presentation.
- Synchronize app records through RLS-protected Cloud storage; retain the legacy browser copy only for explicit recovery, never automatically trust its roles or overwrite Cloud records.
- Keep support ticket management in its own component and persist through the authenticated Cloud writer; existing RLS enforces cross-account Master access without privileged client operations.
- Background medication reminders use Firebase messaging, owner-scoped device registrations and one authenticated scheduled dispatcher; page timers only handle foreground alarms and must never be described as background delivery.
