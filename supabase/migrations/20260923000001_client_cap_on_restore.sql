-- clients_enforce_cap only fired on insert, so a coach at their seat cap
-- could dodge it by archiving one client and restoring another (or the
-- same one back). Re-run the same check on the status transition that
-- takes a client out of 'archived'.
create trigger clients_enforce_cap_on_restore
  before update of status on public.clients
  for each row
  when (old.status = 'archived' and new.status <> 'archived')
  execute function private.enforce_client_cap();
