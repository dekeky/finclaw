package agentruntime

import (
	"context"
)

type Agent interface {
	Run(ctx context.Context) error
}
