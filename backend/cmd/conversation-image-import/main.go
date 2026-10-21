// Offline adapter: stdin contains normalized historical jobs; stdout contains
// only the same whitelisted records produced by the live recorder.
package main

import (
	"encoding/json"
	"github.com/QuantumNous/new-api/pkg/conversationlog"
	"io"
	"os"
)

func main() {
	decoder := json.NewDecoder(os.Stdin)
	encoder := json.NewEncoder(os.Stdout)
	for {
		var job conversationlog.Job
		if err := decoder.Decode(&job); err == io.EOF {
			return
		} else if err != nil {
			os.Exit(2)
		}
		if len(job.Request) > conversationlog.CaptureLimit || len(job.Response) > conversationlog.CaptureLimit {
			continue
		}
		if record, ok := conversationlog.Prepare(job); ok {
			if encoder.Encode(record) != nil {
				os.Exit(3)
			}
		}
	}
}
