//go:build !windows

package service

import (
	"golang.org/x/sys/unix"
	"os"
)

func lockSoftwareFile(file *os.File) error { return unix.Flock(int(file.Fd()), unix.LOCK_EX) }
func unlockSoftwareFile(file *os.File)     { _ = unix.Flock(int(file.Fd()), unix.LOCK_UN) }

func softwareFreeDisk(directory string) (int64, error) {
	var status unix.Statfs_t
	if err := unix.Statfs(directory, &status); err != nil {
		return 0, err
	}
	return int64(status.Bavail) * int64(status.Bsize), nil
}
