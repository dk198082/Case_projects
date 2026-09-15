import { useRoute } from "wouter";
import { AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function NotFound() {
  const [_, params] = useRoute("/:rest*");

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <h1 className="text-2xl font-bold text-foreground">404 Page Not Found</h1>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Did you forget to add the page to the router?
          </p>
          <div className="mt-6 flex justify-end">
            <a
              href="/"
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 transition-colors"
            >
              Return Home
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
