import { NextResponse } from "next/server"

export const runtime = "edge"

export async function POST() {
  return NextResponse.json(
    { error: "注册入口已关闭，请联系管理员创建账号" },
    { status: 403 }
  )
}
