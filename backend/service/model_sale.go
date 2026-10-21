package service

import (
	"context"
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"os"
	"time"
)

func StartModelSaleWorker() func() {
	if !common.IsMasterNode || os.Getenv("MODEL_SALE_WORKER_DISABLED") == "true" {
		return func() {}
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		defer close(done)
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()
		for {
			var sales []model.ModelSale
			if err := model.DB.Select("id").Where("status IN ?", []string{"scheduled", "active"}).Find(&sales).Error; err == nil {
				for _, sale := range sales {
					if ctx.Err() != nil {
						return
					}
					if err := model.TickModelSale(sale.ID, time.Now()); err != nil {
						common.SysError("model sale scheduler could not update an activity")
					}
				}
			}
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	}()
	return func() { cancel(); <-done }
}
