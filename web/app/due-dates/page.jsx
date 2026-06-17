"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DueDatesPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/my-tasks");
  }, [router]);

  return null;
}
