import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePageMeta } from '@/hooks/usePageMeta';

const PrivacyPolicy = () => {
  const navigate = useNavigate();

  usePageMeta({
    title: 'Privacy Policy | Flowist',
    description: 'Read the Flowist Privacy Policy to learn how we collect, use, and protect your data when you use our notes, to-do, and planner app.',
    path: '/privacy-policy',
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1 rounded-lg hover:bg-accent">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold">Privacy Policy</h1>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-8 pb-24">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold">Privacy Policy</h2>
          <p className="text-muted-foreground text-sm">Effective Date: February 19, 2026</p>
          <p className="text-muted-foreground text-sm">Last Updated: March 4, 2026</p>
        </div>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">1. Introduction</h3>
          <p className="text-muted-foreground leading-relaxed">
            Welcome to Flowist: Notepad & To Do List ("we," "our," or "us"). We are committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application and related services.
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">2. Local-First Architecture</h3>
          <p className="text-muted-foreground leading-relaxed">
            Flowist is built on a local-first architecture. This means all your notes, tasks, code snippets, drawings, sticky notes, and other content are primarily stored on your device. The App works completely offline without requiring an internet connection for core functionality. No account or sign-up is required to use the App. You can start using all essential features immediately after installation.
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">3. Information We Collect</h3>

          <h4 className="font-medium">3.1 Information You Provide (Only When You Choose)</h4>
          <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
            <li>Google account information only if you voluntarily sign in with Google for cloud sync.</li>
            <li>Notes, tasks, drawings, code snippets, and other content you create within the App. This content is stored locally on your device by default.</li>
            <li>Preferences, themes, and settings you configure within the App.</li>
            <li>Feedback, support requests, and correspondence if you contact us directly.</li>
            <li>Payment information for premium features, processed entirely by third-party payment providers. We never see or store your payment details.</li>
          </ul>

          <h4 className="font-medium mt-4">3.2 Information Collected Automatically</h4>
          <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
            <li>Basic device information such as device type, operating system version, and app version for crash reporting and performance improvement.</li>
            <li>Anonymous usage data such as feature interaction patterns and crash reports to help us improve the App.</li>
            <li>This data is collected in aggregate and cannot be used to personally identify you.</li>
          </ul>

          <h4 className="font-medium mt-4">3.3 Information from Third Parties (Only When You Enable)</h4>
          <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
            <li>Google account information only if you choose to use Google Sign-In.</li>
            <li>Google Drive data only if you voluntarily enable cloud sync.</li>
            <li>No data is collected from third parties without your explicit action.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">4. How We Use Your Information</h3>
          <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
            <li>To provide, maintain, and improve the App and its features.</li>
            <li>To sync your data across devices only when you voluntarily enable cloud sync via Google Drive.</li>
            <li>To process transactions and manage subscriptions through your app store provider.</li>
            <li>To send notifications, reminders, and alerts that you have configured within the App.</li>
            <li>To provide customer support when you contact us.</li>
            <li>To monitor anonymous usage patterns and improve app performance and stability.</li>
            <li>To detect, prevent, and address technical issues and crashes.</li>
            <li>To comply with legal obligations.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">5. Data Storage and Security</h3>
          <p className="text-muted-foreground leading-relaxed">
            All your notes, tasks, drawings, and personal content are stored locally on your device by default. No data is sent to our servers at any time. When you voluntarily enable cloud sync via Google Drive, your data is stored in your own personal Google Drive account. Data is encrypted during transit when syncing with Google Drive.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            The App supports biometric authentication including fingerprint and face unlock to protect access to your content. We implement appropriate technical and organizational security measures to protect the App. We recommend using device-level security features such as lock screen, PIN, fingerprint, or face unlock, regularly backing up your device, and keeping your device software and the App updated.
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">6. Data Sharing and Disclosure</h3>
          <p className="text-muted-foreground leading-relaxed">We do not sell your personal information. We do not share your notes, tasks, or any content with anyone. We may share limited anonymous information only with:</p>
          <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
            <li><strong>Service Providers:</strong> Third-party services that help operate the App, such as crash reporting tools.</li>
            <li><strong>Legal Requirements:</strong> When required by law, regulation, or legal process.</li>
            <li><strong>Safety:</strong> To protect rights, property, or safety of our users or the public.</li>
            <li><strong>Business Transfers:</strong> In connection with mergers, acquisitions, or asset sales.</li>
            <li><strong>With Your Consent:</strong> When you explicitly authorize sharing.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">7. Third-Party Services</h3>
          <p className="text-muted-foreground leading-relaxed">The App may integrate with the following third-party services only when you choose to enable them:</p>
          <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
            <li><strong>Google Drive:</strong> For optional cloud synchronization of your data. Your data is stored in your own Google Drive account.</li>
            <li><strong>Google Sign-In:</strong> For optional authentication when enabling cloud sync.</li>
            <li><strong>RevenueCat:</strong> For subscription and premium feature management. RevenueCat processes subscription data only and does not access your content.</li>
          </ul>
          <p className="text-muted-foreground leading-relaxed">
            Your use of these third-party services is subject to their respective privacy policies.
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">8. Offline Functionality</h3>
          <p className="text-muted-foreground leading-relaxed">
            Flowist works completely offline. No internet connection is required for creating, editing, organizing, or managing your notes, tasks, code snippets, drawings, or sticky notes. Internet connection is only needed when you voluntarily enable cloud sync or manage subscriptions.
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">9. Your Rights and Choices</h3>
          <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
            <li>You can access, edit, and delete all your notes, tasks, and content at any time within the App.</li>
            <li>You can export your notes and tasks in multiple formats including PDF, DOCX, and Markdown.</li>
            <li>You can enable or disable cloud sync at any time.</li>
            <li>You can enable or disable notifications and reminders at any time.</li>
            <li>You can enable or disable biometric authentication at any time.</li>
            <li>You can request data portability of your content.</li>
            <li>You can delete all App data by clearing App data from your device settings or by uninstalling the App.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">10. Children's Privacy</h3>
          <p className="text-muted-foreground leading-relaxed">
            Our App is not specifically directed to children under 13. We do not knowingly collect personal information from children under 13. Since the App operates locally on your device and does not require account creation, it is safe for users of all ages under parental supervision.
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">11. Data Retention</h3>
          <p className="text-muted-foreground leading-relaxed">
            Data stored locally on your device remains until you delete it within the App, clear the App data from device settings, or uninstall the App. Cloud-synced data stored in your Google Drive remains until you delete it from Google Drive or disable cloud sync. Anonymous usage and crash data is retained only as long as necessary to improve App performance and stability.
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">12. Free Trial and Subscription Terms</h3>
          <p className="text-muted-foreground leading-relaxed">
            The App may offer a free trial period for premium features. When the free trial ends, access to premium features will require a paid subscription. No refunds will be provided for subscription fees once charged. By subscribing, you acknowledge and agree to our no-refund policy. You may cancel your subscription at any time through your app store settings to prevent future charges, but no partial or full refunds will be issued for the current billing period. Subscription billing is handled entirely by your app store provider and is subject to their terms and policies.
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">13. Changes to This Privacy Policy</h3>
          <p className="text-muted-foreground leading-relaxed">
            We may update this Privacy Policy from time to time. Any changes will be posted within the App with an updated "Last Updated" date and will take effect immediately upon posting. Your continued use of the App after changes constitutes acceptance of the updated policy. We encourage you to review this Privacy Policy periodically.
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">14. Governing Law</h3>
          <p className="text-muted-foreground leading-relaxed">
            This Privacy Policy shall be governed by and construed in accordance with the laws of USA, Pakistan, without regard to its conflict of law provisions.
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">15. Contact Us</h3>
          <p className="text-muted-foreground leading-relaxed">
            If you have any questions or concerns about this Privacy Policy, please contact us at:
          </p>
          <p className="text-muted-foreground">
            Email: bugtishop@gmail.com
          </p>
        </section>
      </main>
    </div>
  );
};

export default PrivacyPolicy;
