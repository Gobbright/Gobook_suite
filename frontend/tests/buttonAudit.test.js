import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectButtons } from '../scripts/auditButtons.mjs';

test('audit distinguishes missing actions, empty handlers, forwarding and native submission', () => {
  const result = inspectButtons(`const C = () => <><button>Dead</button><button onClick={() => {}}>Empty</button><button disabled={busy}>Conditional</button><button disabled>Unavailable</button><button {...props}>Forwarded</button><form onSubmit={save}><button>Save</button><button type="button">Missing</button><button onClick={toggle}>Accidental submit</button></form><Button onClick={open}>Open</Button></>;`);
  assert.deepEqual(result.map((row) => row.status), ['needs-review', 'empty-handler', 'needs-review', 'disabled', 'forwarded-props', 'native-submit', 'needs-review', 'implicit-submit', 'handler-present']);
});

test('audit accepts delegated clicks and explicit external form submits', () => {
  assert.deepEqual(inspectButtons(`const C=()=> <><div onClick={choose}><button type="button">Choice</button></div><button type="submit" form="editor">Save</button></>;`).map((row) => row.status), ['handler-present', 'native-submit']);
});
