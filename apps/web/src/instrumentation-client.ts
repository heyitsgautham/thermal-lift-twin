import { installErrorReporting } from "@/lib/report-error";

// Runs in the browser before the app hydrates, so errors thrown while a page
// starts up are reported too.
installErrorReporting(window);
