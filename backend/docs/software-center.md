# Software Center administration

Administrators maintain software and external tools at `/system-settings/site/software`.
The public `/software` page reads only published catalog entries. The original `/app` download page remains independent.

## Featured placements

In Software management, use **Configure recommendations** to select up to five main-carousel items and three right-side cards. Software and tools share the searchable selectors. Move items up/down to set their order, clear a slot to remove it, then save. The first right-side card is larger. Empty areas are hidden; this does not remove items from the catalog. Rotation remains four seconds with hover/focus pause.

The optional `featured` catalog field stores ordered `carousel` and `tiles` ID arrays using the existing atomic, revision-checked catalog save API. Older catalogs without this field retain automatic selection until the administrator first saves the configuration. Explicit empty arrays stay empty. Public responses omit unpublished selections without substituting another product. Republishing restores the saved placement. Deleting an item through software management also removes its references from the configuration. The backend rejects duplicate/unknown IDs and over-capacity arrays. This change adds no database schema or authentication behavior.

## Persistence and backups

Catalog: `/data/software-center/catalog.json`; uploaded installers and their SHA-256 metadata: `/data/software-center/files/`.
The existing persistent `/data` Docker bind mount is required. Back up this directory together with the existing database and other `/data` assets. No schema, billing, user credentials or shop data changes are introduced.
`SOFTWARE_CENTER_DIR` can override the location. Catalog replacements are atomic, revision checked, and protected by an OS file lock across processes. Failed or interrupted uploads remove their temporary file. Published file references prevent accidental deletion.

## Upload and download policy

Only root administrators may read/edit the private catalog, upload installers or delete unused files. Existing RootAuth, session-origin protection and same-origin checks are reused. Uploads are streamed, limited to 1 GiB per file and 2 GiB total, with 512 MiB of disk space reserved. Only installer/archive extensions with matching signatures are accepted; files are neither executed nor extracted. Images use the existing decoded/re-encoded product-image uploader.
The reverse proxy raises its limit only for `/api/software/admin/files` (1025m, 30-minute timeout, buffering disabled). Public download responses require a published catalog reference and use attachment disposition, octet-stream, nosniff and no-store; ranges and HEAD are supported. Uploaded files are stored outside the webroot. External links require HTTPS. Antivirus scanning is not provided.

## Security references and checks

OWASP ASVS 5.0.0 (file handling and access-control areas), File Upload, Authorization, Authentication and Session Management cheat sheets were consulted. This does not certify ASVS compliance. Authentication contracts were reused without changing login or tokens.
Focused router integration tests cover guest/user/root authorization, cross-origin writes, invalid file types/signatures/paths/size, revision conflicts, metadata persistence, Unicode filenames, copied absolute links, public download headers, draft/published transitions and used-file deletion rejection. Frontend tests cover uploads, cancellation, failed uploads/saves, external tools, account switches and guest catalogs. Production verification uses a temporary administrator-created ZIP and removes it after checking the entire lifecycle.

References:
- https://owasp.org/projects/asvs
- https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html

## Public software details

Published software and tools have guest-accessible `/software/{id}` detail pages. Card titles and detail links open the page while existing download buttons remain direct downloads. The home carousel continues to rotate every four seconds with accessible pause behavior.

In Software management, edit an item and fill in Software details: introduction, one feature per line, changelog, system requirements, publisher, category, license and a real update date. Unknown fields may remain blank. Screenshot uploads reuse the existing product image processing, reorder/remove controls and image preview; up to 12 PNG/JPEG/WebP images, 5 MB each. Screenshots can be hidden without deleting them and use portrait or landscape presentation. The original shop image editor defaults are preserved.

These optional fields are stored under `details` in the revision-checked catalog. Legacy records without `details` still display their summary and supported platforms. Drafts remain excluded from the public catalog, and no ratings, reviews or download totals are generated. The native skymoni App is unchanged; web pages do not automatically update native screens.
