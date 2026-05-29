import { NextResponse } from 'next/server';

interface ApiSuccess<T> {
  success: true;
  data: T;
  message?: string;
  pagination?: { page: number; limit: number; total: number; totalPages: number };
}

interface ApiError {
  success: false;
  message: string;
}

export function ok<T>(data: T, message?: string, init?: ResponseInit): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ success: true, data, message }, init);
}

export function paginated<T>(
  data: T,
  page: number,
  limit: number,
  total: number,
  message?: string,
): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({
    success: true,
    data,
    message,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

export function err(message: string, status = 400): NextResponse<ApiError> {
  return NextResponse.json({ success: false, message }, { status });
}
