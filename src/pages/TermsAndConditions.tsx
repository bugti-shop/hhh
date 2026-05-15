import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePageMeta } from '@/hooks/usePageMeta';

const TermsAndConditions = () => {
  const navigate = useNavigate();

  usePageMeta({
    title: 'Terms & Conditions | Flowist',
    description: 'Review the Flowist Terms of Service governing your use of our notes, to-do list, habit tracking, and daily planner app.',
    path: '/terms-and-conditions',
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1 rounded-lg hover:bg-accent">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold">Terms of Service</h1>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-8 pb-24">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold">Terms of Service</h2>
          <p className="text-muted-foreground text-sm">Effective Date: March 4, 2026</p>
          <p className="text-muted-foreground text-sm">Last Updated: March 4, 2026</p>
        </div>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">1. Introduction</h3>
          <p className="text-muted-foreground leading-relaxed">
            Welcome to Flowist: Notepad & To Do List ("the App," "we," "our," or "us"). These Terms of Service ("Terms") govern your access to and use of the App and all related services. By downloading, installing, or using the App, you agree to be bound by these Terms. If you do not agree with any part of these Terms, please do not use the App.
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">2. Description of Service</h3>
          <p className="text-muted-foreground leading-relaxed">
            Flowist is a productivity application that provides notepad, to-do list, code editing, sketching, and task management features. The App allows you to create, edit, organize, and export notes and tasks. Additional features include cloud sync via Google Drive, dark themes, syntax highlighting, sticky notes, reminders, and drawing tools.
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">3. Eligibility</h3>
          <p className="text-muted-foreground leading-relaxed">
            You must be at least 13 years of age to use the App. By using the App, you represent and warrant that you meet this age requirement. If you are under 18, you must have permission from a parent or legal guardian.
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">4. User Accounts</h3>
          <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
            <li>You may use the App without creating an account for basic functionality.</li>
            <li>Certain features such as cloud sync and cross-device access require signing in with a Google account.</li>
            <li>You are responsible for maintaining the confidentiality of your account credentials.</li>
            <li>You are responsible for all activities that occur under your account.</li>
            <li>You must notify us immediately of any unauthorized use of your account.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">5. User Content</h3>
          <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
            <li>You retain full ownership of all notes, tasks, drawings, code snippets, and other content you create within the App.</li>
            <li>You are solely responsible for the content you create, store, and share using the App.</li>
            <li>We do not claim any ownership or intellectual property rights over your content.</li>
            <li>We do not monitor, review, or access your content unless required by law or with your explicit consent.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">6. Acceptable Use</h3>
          <p className="text-muted-foreground leading-relaxed">You agree not to use the App to:</p>
          <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
            <li>Create, store, or distribute content that is illegal, harmful, threatening, abusive, or otherwise objectionable.</li>
            <li>Violate any applicable local, national, or international law or regulation.</li>
            <li>Attempt to reverse engineer, decompile, disassemble, or otherwise attempt to derive the source code of the App.</li>
            <li>Distribute, modify, or create derivative works based on the App without our written consent.</li>
            <li>Interfere with or disrupt the integrity or performance of the App or its related systems.</li>
            <li>Attempt to gain unauthorized access to any part of the App or its related systems.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">7. Premium Features and Subscriptions</h3>
          <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
            <li>The App may offer premium features through paid subscriptions.</li>
            <li>Subscription fees are billed through your app store provider (Google Play Store or Apple App Store) and are subject to their terms and policies.</li>
            <li>Prices may vary by region and are subject to change with prior notice.</li>
            <li>Free trial periods may be offered for premium features.</li>
            <li>Upon expiration of a free trial, continued access to premium features requires a paid subscription.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">8. No Refund Policy</h3>
          <p className="text-muted-foreground leading-relaxed">
            All subscription payments are final and non-refundable. No refunds will be issued for subscription fees once charged, including partial billing periods. You may cancel your subscription at any time through your app store settings to prevent future charges. Cancellation will take effect at the end of the current billing period, and you will retain access to premium features until that period ends. By subscribing, you explicitly acknowledge and agree to this no-refund policy.
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">9. Cloud Sync and Data</h3>
          <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
            <li>When you enable cloud sync via Google Drive, your data is stored in your own Google Drive account.</li>
            <li>We do not store your synced data on our servers.</li>
            <li>You are responsible for managing your Google Drive storage and ensuring sufficient space for synced data.</li>
            <li>We are not responsible for any data loss or corruption that occurs during sync or within your Google Drive account.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">10. Intellectual Property</h3>
          <p className="text-muted-foreground leading-relaxed">
            All content, design, graphics, icons, features, and functionality of the App are owned by Flowist and are protected by intellectual property laws. You are granted a limited, non-exclusive, non-transferable, revocable license to use the App for personal and non-commercial purposes. The Flowist name, logo, and all related names, logos, product and service names, designs, and slogans are our trademarks. You may not use them without our prior written permission.
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">11. Third-Party Services</h3>
          <p className="text-muted-foreground leading-relaxed">The App integrates with the following third-party services:</p>
          <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
            <li><strong>Google Drive</strong> for cloud synchronization.</li>
            <li><strong>Google Sign-In</strong> for authentication.</li>
            <li><strong>RevenueCat</strong> for subscription management.</li>
          </ul>
          <p className="text-muted-foreground leading-relaxed">
            Your use of these third-party services is subject to their respective terms of service and privacy policies. We are not responsible for the practices or content of any third-party services.
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">12. Disclaimer of Warranties</h3>
          <p className="text-muted-foreground leading-relaxed">
            The App is provided on an "as is" and "as available" basis without warranties of any kind, either express or implied. We do not guarantee that the App will be error-free, uninterrupted, secure, or free of harmful components. We do not guarantee the accuracy, reliability, or completeness of any content or features within the App. We are not responsible for any decisions you make based on information or content created within the App.
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">13. Limitation of Liability</h3>
          <p className="text-muted-foreground leading-relaxed">
            To the maximum extent permitted by applicable law, Flowist and its developers shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the App. We are not responsible for any data loss, content loss, or damages resulting from the use or inability to use the App, including data lost during cloud sync or device failure. Our total liability for any claim arising from these Terms shall not exceed the amount you paid for the App in the twelve months preceding the claim.
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">14. Indemnification</h3>
          <p className="text-muted-foreground leading-relaxed">
            You agree to indemnify, defend, and hold harmless Flowist and its developers from any claims, losses, damages, liabilities, costs, and expenses arising from your use of the App, your violation of these Terms, or your violation of any rights of any third party.
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">15. Termination</h3>
          <p className="text-muted-foreground leading-relaxed">
            We reserve the right to terminate or suspend your access to the App at any time, without prior notice, for conduct that we believe violates these Terms or is harmful to other users or the App. You may stop using the App at any time by uninstalling it from your device. Upon termination, your right to use the App will immediately cease. Data stored locally on your device will remain until you delete it or uninstall the App.
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">16. Changes to These Terms</h3>
          <p className="text-muted-foreground leading-relaxed">
            We may update these Terms from time to time. Any changes will be posted within the App and will take effect immediately upon posting. Your continued use of the App after any changes constitutes acceptance of the updated Terms. We encourage you to review these Terms periodically.
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">17. Severability</h3>
          <p className="text-muted-foreground leading-relaxed">
            If any provision of these Terms is found to be unenforceable or invalid, that provision shall be limited or eliminated to the minimum extent necessary, and the remaining provisions shall remain in full force and effect.
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">18. Entire Agreement</h3>
          <p className="text-muted-foreground leading-relaxed">
            These Terms, together with our Privacy Policy, constitute the entire agreement between you and Flowist regarding your use of the App and supersede all prior agreements and understandings.
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">19. Governing Law</h3>
          <p className="text-muted-foreground leading-relaxed">
            These Terms shall be governed by and construed in accordance with the laws of USA, Pakistan, without regard to conflict of law provisions.
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">20. Contact Us</h3>
          <p className="text-muted-foreground leading-relaxed">
            If you have any questions or concerns about these Terms of Service, please contact us at:
          </p>
          <p className="text-muted-foreground">
            Email: bugtishop@gmail.com
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">21. Acknowledgment</h3>
          <p className="text-muted-foreground leading-relaxed">
            By downloading, installing, or using Flowist: Notepad & To Do List, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service and our Privacy Policy.
          </p>
        </section>
      </main>
    </div>
  );
};

export default TermsAndConditions;