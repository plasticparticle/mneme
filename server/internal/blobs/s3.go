package blobs

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/url"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"

	"github.com/plasticparticle/mneme/server/internal/config"
)

// s3Store relays opaque chunks to any S3-compatible store (MinIO/Garage/AWS).
type s3Store struct {
	client *minio.Client
	bucket string
}

func newS3(cfg config.S3Config) (Store, error) {
	u, err := url.Parse(cfg.Endpoint)
	if err != nil || u.Host == "" {
		return nil, fmt.Errorf("invalid S3_ENDPOINT %q", cfg.Endpoint)
	}
	client, err := minio.New(u.Host, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure: u.Scheme == "https",
	})
	if err != nil {
		return nil, fmt.Errorf("s3 client: %w", err)
	}
	// Self-provision the bucket so a fresh homelab deploy needs no manual mc step.
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	exists, err := client.BucketExists(ctx, cfg.Bucket)
	if err != nil {
		return nil, fmt.Errorf("s3 bucket check: %w", err)
	}
	if !exists {
		if err := client.MakeBucket(ctx, cfg.Bucket, minio.MakeBucketOptions{}); err != nil {
			return nil, fmt.Errorf("s3 bucket create: %w", err)
		}
	}
	return &s3Store{client: client, bucket: cfg.Bucket}, nil
}

func (s *s3Store) Put(ctx context.Context, key string, data []byte) error {
	_, err := s.client.PutObject(ctx, s.bucket, key, bytes.NewReader(data), int64(len(data)),
		minio.PutObjectOptions{ContentType: "application/octet-stream"})
	return err
}

func (s *s3Store) Delete(ctx context.Context, key string) error {
	// RemoveObject on a missing key is a no-op in S3 semantics — matches the interface.
	return s.client.RemoveObject(ctx, s.bucket, key, minio.RemoveObjectOptions{})
}

func (s *s3Store) Get(ctx context.Context, key string) ([]byte, error) {
	obj, err := s.client.GetObject(ctx, s.bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, err
	}
	defer obj.Close() //nolint:errcheck // read-only stream
	data, err := io.ReadAll(obj)
	if err != nil {
		var mErr minio.ErrorResponse
		if errors.As(err, &mErr) && mErr.Code == "NoSuchKey" {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return data, nil
}
