import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './state/AuthContext';
import { MetaProvider } from './state/MetaContext';
import { NotificationsProvider } from './state/NotificationsContext';
import { ToastProvider } from './state/ToastContext';
import { BookingProvider } from './state/BookingContext';
import { ThemeProvider } from './state/ThemeContext';
import { RequireAuth, RedirectIfAuthed } from './components/Guards';
import { PageLoader } from './components/ui';
import { InstallBanner } from './components/InstallBanner';
import { PublicLayout } from './components/layout/PublicLayout';
import { ParentShell } from './components/layout/ParentShell';
import { StudentShell } from './components/layout/StudentShell';
import { AppShell } from './components/layout/AppShell';

const Landing = lazy(() => import('./pages/Landing'));
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'));
const OtpPage = lazy(() => import('./pages/auth/OtpPage'));
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage'));
const NotFound = lazy(() => import('./pages/NotFound'));

const StudentLogin = lazy(() => import('./pages/student/StudentLogin'));
const StudentRegister = lazy(() => import('./pages/student/StudentRegister'));
const StudentOnboarding = lazy(() => import('./pages/student/StudentOnboarding'));
const StudentHome = lazy(() => import('./pages/student/StudentHome'));
const StudentBookPickup = lazy(() => import('./pages/student/StudentBookPickup'));
const StudentBookDestination = lazy(() => import('./pages/student/StudentBookDestination'));
const StudentBookDrivers = lazy(() => import('./pages/student/StudentBookDrivers'));
const StudentBookConfirm = lazy(() => import('./pages/student/StudentBookConfirm'));
const StudentRide = lazy(() => import('./pages/student/StudentRide'));
const StudentTrips = lazy(() => import('./pages/student/StudentTrips'));
const StudentRewards = lazy(() => import('./pages/student/StudentRewards'));
const StudentProfile = lazy(() => import('./pages/student/StudentProfile'));
const StudentGuardians = lazy(() => import('./pages/student/StudentGuardians'));
const StudentEmergency = lazy(() => import('./pages/student/StudentEmergency'));
const StudentNotifications = lazy(() => import('./pages/student/StudentNotifications'));

const ParentDashboard = lazy(() => import('./pages/parent/ParentDashboard'));
const ParentLiveTrip = lazy(() => import('./pages/parent/ParentLiveTrip'));
const ParentHistory = lazy(() => import('./pages/parent/ParentHistory'));
const ParentProfile = lazy(() => import('./pages/parent/ParentProfile'));
const ParentGuardians = lazy(() => import('./pages/parent/ParentGuardians'));
const ParentRideDetail = lazy(() => import('./pages/parent/ParentRideDetail'));

const DriverLogin = lazy(() => import('./pages/driver/DriverLogin'));
const DriverDashboard = lazy(() => import('./pages/driver/DriverDashboard'));
const DriverVerification = lazy(() => import('./pages/driver/DriverVerification'));
const DriverActiveRide = lazy(() => import('./pages/driver/DriverActiveRide'));
const DriverTrips = lazy(() => import('./pages/driver/DriverTrips'));
const DriverProfile = lazy(() => import('./pages/driver/DriverProfile'));

const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminVerifications = lazy(() => import('./pages/admin/AdminVerifications'));
const AdminRides = lazy(() => import('./pages/admin/AdminRides'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminEmergencies = lazy(() => import('./pages/admin/AdminEmergencies'));
const AdminReports = lazy(() => import('./pages/admin/AdminReports'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));

const NotificationsPage = lazy(() => import('./pages/shared/NotificationsPage'));

const driverNav = [
  { to: '/driver', label: 'Dashboard', icon: 'layout-dashboard', end: true },
  { to: '/driver/ride', label: 'Active Ride', icon: 'navigation' },
  { to: '/driver/trips', label: 'Trip History', icon: 'history' },
  { to: '/driver/verification', label: 'Verification', icon: 'file-check' },
  { to: '/driver/profile', label: 'Profile', icon: 'user-round' },
];

const adminNav = [
  { to: '/admin', label: 'Dashboard', icon: 'layout-dashboard', end: true },
  { to: '/admin/verifications', label: 'Verifications', icon: 'file-check' },
  { to: '/admin/rides', label: 'Rides', icon: 'car' },
  { to: '/admin/emergencies', label: 'Emergencies', icon: 'siren' },
  { to: '/admin/reports', label: 'Safety Reports', icon: 'shield-alert' },
  { to: '/admin/users', label: 'Users', icon: 'users' },
  { to: '/admin/settings', label: 'Settings', icon: 'settings' },
];

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-canvas-alt">
          <PageLoader />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
      <AuthProvider>
        <MetaProvider>
          <NotificationsProvider>
            <ToastProvider>
              <BookingProvider>
                <InstallBanner />
                <Routes>
                  {/* ---------------- Public ---------------- */}
                  <Route element={<PublicLayout />}>
                    <Route
                      path="/"
                      element={
                        <Screen>
                          <Landing />
                        </Screen>
                      }
                    />
                    <Route
                      path="/login"
                      element={
                        <Screen>
                          <RedirectIfAuthed>
                            <LoginPage />
                          </RedirectIfAuthed>
                        </Screen>
                      }
                    />
                    <Route
                      path="/register"
                      element={
                        <Screen>
                          <RedirectIfAuthed>
                            <RegisterPage />
                          </RedirectIfAuthed>
                        </Screen>
                      }
                    />
                    <Route
                      path="/verify-otp"
                      element={
                        <Screen>
                          <RedirectIfAuthed>
                            <OtpPage />
                          </RedirectIfAuthed>
                        </Screen>
                      }
                    />
                    <Route
                      path="/forgot-password"
                      element={
                        <Screen>
                          <RedirectIfAuthed>
                            <ForgotPasswordPage />
                          </RedirectIfAuthed>
                        </Screen>
                      }
                    />
                    <Route
                      path="/onboarding"
                      element={
                        <Screen>
                          <StudentOnboarding />
                        </Screen>
                      }
                    />
                    <Route
                      path="/student/login"
                      element={
                        <Screen>
                          <RedirectIfAuthed>
                            <StudentLogin />
                          </RedirectIfAuthed>
                        </Screen>
                      }
                    />
                    <Route
                      path="/student/register"
                      element={
                        <Screen>
                          <RedirectIfAuthed>
                            <StudentRegister />
                          </RedirectIfAuthed>
                        </Screen>
                      }
                    />
                    <Route
                      path="/driver/login"
                      element={
                        <Screen>
                          <RedirectIfAuthed>
                            <DriverLogin />
                          </RedirectIfAuthed>
                        </Screen>
                      }
                    />
                    <Route
                      path="/driver/register"
                      element={
                        <Screen>
                          <RedirectIfAuthed>
                            <DriverLogin mode="register" />
                          </RedirectIfAuthed>
                        </Screen>
                      }
                    />
                    <Route
                      path="/splash"
                      element={<Navigate to="/onboarding" replace />}
                    />
                  </Route>

                  {/* ---------------- Parent web ---------------- */}
                  <Route element={<RequireAuth roles={['PARENT', 'ADMIN']} />}>
                    <Route element={<ParentShell />}>
                      <Route
                        path="/parent"
                        element={
                          <Screen>
                            <ParentDashboard />
                          </Screen>
                        }
                      />
                      <Route
                        path="/parent/live"
                        element={
                          <Screen>
                            <ParentLiveTrip />
                          </Screen>
                        }
                      />
                      <Route
                        path="/parent/history"
                        element={
                          <Screen>
                            <ParentHistory />
                          </Screen>
                        }
                      />
                      <Route
                        path="/parent/ride/:id"
                        element={
                          <Screen>
                            <ParentRideDetail />
                          </Screen>
                        }
                      />
                      <Route
                        path="/parent/notifications"
                        element={
                          <Screen>
                            <NotificationsPage />
                          </Screen>
                        }
                      />
                      <Route
                        path="/parent/guardians"
                        element={
                          <Screen>
                            <ParentGuardians />
                          </Screen>
                        }
                      />
                      <Route
                        path="/parent/profile"
                        element={
                          <Screen>
                            <ParentProfile />
                          </Screen>
                        }
                      />
                    </Route>
                  </Route>

                  {/* ---------------- Student app ---------------- */}
                  <Route element={<RequireAuth roles={['STUDENT', 'ADMIN']} />}>
                    <Route element={<StudentShell />}>
                      <Route
                        path="/student"
                        element={
                          <Screen>
                            <StudentHome />
                          </Screen>
                        }
                      />
                      <Route
                        path="/student/book"
                        element={<Navigate to="/student/book/pickup" replace />}
                      />
                      <Route
                        path="/student/book/pickup"
                        element={
                          <Screen>
                            <StudentBookPickup />
                          </Screen>
                        }
                      />
                      <Route
                        path="/student/book/destination"
                        element={
                          <Screen>
                            <StudentBookDestination />
                          </Screen>
                        }
                      />
                      <Route
                        path="/student/book/drivers"
                        element={
                          <Screen>
                            <StudentBookDrivers />
                          </Screen>
                        }
                      />
                      <Route
                        path="/student/book/confirm"
                        element={
                          <Screen>
                            <StudentBookConfirm />
                          </Screen>
                        }
                      />
                      <Route
                        path="/student/ride/:id"
                        element={
                          <Screen>
                            <StudentRide />
                          </Screen>
                        }
                      />
                      <Route
                        path="/student/active"
                        element={<Navigate to="/student" replace />}
                      />
                      <Route
                        path="/student/trips"
                        element={
                          <Screen>
                            <StudentTrips />
                          </Screen>
                        }
                      />
                      <Route
                        path="/student/rewards"
                        element={
                          <Screen>
                            <StudentRewards />
                          </Screen>
                        }
                      />
                      <Route
                        path="/student/guardians"
                        element={
                          <Screen>
                            <StudentGuardians />
                          </Screen>
                        }
                      />
                      <Route
                        path="/student/notifications"
                        element={
                          <Screen>
                            <StudentNotifications />
                          </Screen>
                        }
                      />
                      <Route
                        path="/student/emergency"
                        element={
                          <Screen>
                            <StudentEmergency />
                          </Screen>
                        }
                      />
                      <Route
                        path="/student/profile"
                        element={
                          <Screen>
                            <StudentProfile />
                          </Screen>
                        }
                      />
                    </Route>
                  </Route>

                  {/* ---------------- Driver ---------------- */}
                  <Route element={<RequireAuth roles={['DRIVER']} />}>
                    <Route
                      element={
                        <AppShell workspaceLabel="DRIVER CONSOLE" nav={driverNav} notificationsTo="/driver/notifications" />
                      }
                    >
                      <Route
                        path="/driver"
                        element={
                          <Screen>
                            <DriverDashboard />
                          </Screen>
                        }
                      />
                      <Route
                        path="/driver/ride"
                        element={
                          <Screen>
                            <DriverActiveRide />
                          </Screen>
                        }
                      />
                      <Route
                        path="/driver/ride/:id"
                        element={
                          <Screen>
                            <DriverActiveRide />
                          </Screen>
                        }
                      />
                      <Route
                        path="/driver/trips"
                        element={
                          <Screen>
                            <DriverTrips />
                          </Screen>
                        }
                      />
                      <Route
                        path="/driver/verification"
                        element={
                          <Screen>
                            <DriverVerification />
                          </Screen>
                        }
                      />
                      <Route
                        path="/driver/profile"
                        element={
                          <Screen>
                            <DriverProfile />
                          </Screen>
                        }
                      />
                      <Route
                        path="/driver/notifications"
                        element={
                          <Screen>
                            <NotificationsPage />
                          </Screen>
                        }
                      />
                    </Route>
                  </Route>

                  {/* ---------------- Admin ---------------- */}
                  <Route element={<RequireAuth roles={['ADMIN']} />}>
                    <Route
                      element={
                        <AppShell workspaceLabel="SAFETY DESK" nav={adminNav} notificationsTo="/admin/notifications" />
                      }
                    >
                      <Route
                        path="/admin"
                        element={
                          <Screen>
                            <AdminDashboard />
                          </Screen>
                        }
                      />
                      <Route
                        path="/admin/verifications"
                        element={
                          <Screen>
                            <AdminVerifications />
                          </Screen>
                        }
                      />
                      <Route
                        path="/admin/rides"
                        element={
                          <Screen>
                            <AdminRides />
                          </Screen>
                        }
                      />
                      <Route
                        path="/admin/users"
                        element={
                          <Screen>
                            <AdminUsers />
                          </Screen>
                        }
                      />
                      <Route
                        path="/admin/emergencies"
                        element={
                          <Screen>
                            <AdminEmergencies />
                          </Screen>
                        }
                      />
                      <Route
                        path="/admin/reports"
                        element={
                          <Screen>
                            <AdminReports />
                          </Screen>
                        }
                      />
                      <Route
                        path="/admin/settings"
                        element={
                          <Screen>
                            <AdminSettings />
                          </Screen>
                        }
                      />
                      <Route
                        path="/admin/notifications"
                        element={
                          <Screen>
                            <NotificationsPage />
                          </Screen>
                        }
                      />
                    </Route>
                  </Route>

                  <Route
                    path="*"
                    element={
                      <Screen>
                        <NotFound />
                      </Screen>
                    }
                  />
                </Routes>
              </BookingProvider>
            </ToastProvider>
          </NotificationsProvider>
        </MetaProvider>
      </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
