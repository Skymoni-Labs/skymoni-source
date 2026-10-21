package conversationlog

import (
	"os"
	"syscall"
)

func lockExclusive(f *os.File) error {
	return syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB)
}
func unlock(f *os.File) { _ = syscall.Flock(int(f.Fd()), syscall.LOCK_UN) }
func allocatedBytes(info os.FileInfo) int64 {
	if s, ok := info.Sys().(*syscall.Stat_t); ok {
		return s.Blocks * 512
	}
	return (info.Size() + 4095) / 4096 * 4096
}
