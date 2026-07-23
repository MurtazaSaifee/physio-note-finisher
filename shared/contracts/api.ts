export interface ApiMeta {
  requestId?: string;
  timestamp?: string;
}

export interface ApiSuccess<TData> {
  success: true;
  data: TData;
  meta?: ApiMeta;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    correlationId?: string;
  };
}

export type ApiResponse<TData> = ApiSuccess<TData> | ApiError;
