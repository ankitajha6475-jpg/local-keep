## ADDED Requirements

### Requirement: Content-addressed image storage
The system SHALL store uploaded images in `data/images/` using filenames derived from the SHA-256 hash of the file content. The filename SHALL be the first 16 hex characters of the hash plus the original file extension (e.g., `a1b2c3d4e5f67890.png`).

#### Scenario: Upload a new image
- **WHEN** a PNG image with content hash prefix `a1b2c3d4e5f67890` is uploaded
- **THEN** the file is saved as `data/images/a1b2c3d4e5f67890.png` and the response includes `{ hash: "a1b2c3d4e5f67890", url: "/api/images/a1b2c3d4e5f67890.png" }`

#### Scenario: Duplicate upload is deduplicated
- **WHEN** an image is uploaded that has the same content hash as an existing stored image
- **THEN** the system SHALL NOT create a duplicate file; the existing file is reused and the same URL is returned

### Requirement: Image serve endpoint
The system SHALL serve stored images via `GET /api/images/:filename` with the correct `Content-Type` header based on the file extension.

#### Scenario: Retrieve a stored image
- **WHEN** a GET request is made to `/api/images/a1b2c3d4e5f67890.png`
- **THEN** the server responds with the image binary data and `Content-Type: image/png`

#### Scenario: Request a nonexistent image
- **WHEN** a GET request is made to `/api/images/nonexistent.png`
- **THEN** the server responds with HTTP 404

### Requirement: Image upload endpoint
The system SHALL accept image uploads via `POST /api/images` as multipart form data. The endpoint SHALL be authenticated using the same token mechanism as other API routes. Accepted formats SHALL include PNG, JPEG, GIF, WebP, and SVG.

#### Scenario: Authenticated upload
- **WHEN** an authenticated user POSTs a valid image file to `/api/images`
- **THEN** the image is stored with content-hash filename and the endpoint returns `{ hash, url, mimeType }`

#### Scenario: Unauthenticated upload
- **WHEN** an unauthenticated request POSTs to `/api/images`
- **THEN** the server responds with HTTP 401

#### Scenario: Invalid file type
- **WHEN** a file with MIME type `application/pdf` is uploaded
- **THEN** the server responds with HTTP 400 and an error message

### Requirement: Images directory initialization
The system SHALL ensure the `data/images/` directory exists at server startup.

#### Scenario: Directory missing at startup
- **WHEN** the server starts and `data/images/` does not exist
- **THEN** the server creates the directory automatically
