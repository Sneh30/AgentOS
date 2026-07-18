import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export type ApiHandler<T = unknown> = (params: {
  userId: string;
  request: Request;
}) => Promise<T>;

export function withAuth<T>(handler: ApiHandler<T>) {
  return async (request: Request) => {
    try {
      const { userId } = await auth();
      if (!userId) {
        return unauthorized('Authentication required');
      }
      return success(await handler({ userId, request }));
    } catch (error) {
      return serverError(error);
    }
  };
}

export function success<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function unauthorized(message = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function notFound(message = 'Not found') {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function serverError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Internal server error';
  return NextResponse.json({ error: message }, { status: 500 });
}
