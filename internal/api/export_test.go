package api

// The ConnectOIDC backoff and log lines, exported to the black-box tests
// in package api_test so they assert against the names rather than a copy
// of the values.
const (
	OIDCRetryFirst       = oidcRetryFirst
	OIDCRetryMax         = oidcRetryMax
	MsgOIDCConnectFailed = msgOIDCConnectFailed
	MsgOIDCConnected     = msgOIDCConnected
)
