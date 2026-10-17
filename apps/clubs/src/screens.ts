/*
 * E11-W02 step 6 (TTI < 3 s on the mobile profile): the screens behind the access screen, in one
 * chunk that `App` loads the first time one of them opens. One chunk, not one per screen: a chunk
 * per screen fans the first load out into a dozen requests, which costs more than it saves.
 */
export { ActivityDetailPage } from "./activities/ActivityDetailPage";
export { HistoryRowsPreview } from "./activities/HistoryRowsPreview";
export { InvoicesPage } from "./billing/InvoicesPage";
export { BookingDetailPage } from "./booking/BookingDetailPage";
export { BookPage } from "./booking/BookPage";
export { ConfirmPage } from "./booking/ConfirmPage";
export { HomePage } from "./booking/HomePage";
export { WaitlistDetailPage } from "./booking/WaitlistDetailPage";
export { HistoryPage } from "./history/HistoryPage";
export { InactivityPage } from "./inactivity/InactivityPage";
export { InfoPage } from "./InfoPage";
export { AttendancePage } from "./instructor/AttendancePage";
export { DayPage } from "./instructor/DayPage";
export { RingBlockPage } from "./instructor/RingBlockPage";
export { StudentCardPage } from "./instructor/StudentCardPage";
export { StudentSearchPage } from "./instructor/StudentSearchPage";
export { TasksPage } from "./instructor/TasksPage";
export { LeavePage } from "./leave/LeavePage";
export { NotificationsPage } from "./NotificationsPage";
export { CheckoutReturn } from "./payments/CheckoutReturn";
export { MyDataPage, MyDogsPage } from "./SelfServicePages";
export { SignupPage } from "./SignupPage";
export { OverviewPage } from "./today/OverviewPage";
export { TodayPage } from "./today/TodayPage";
export { TrainingDetailPage } from "./training/TrainingDetailPage";
export { TrainingPage } from "./training/TrainingPage";
export { UnsubscribePage } from "./UnsubscribePage";
