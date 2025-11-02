const BaseService = require('./BaseService');
const PaymentVerification = require('../models/PaymentVerification');
const SubscriptionService = require('./SubscriptionService');
const AdminAuditService = require('./AdminAuditService');
const { parsePaymentScreenshot } = require('../utils/ocr');

class PaymentVerificationService extends BaseService {
  constructor() {
    super(PaymentVerification);
    this.subscriptionService = new SubscriptionService();
    this.adminAuditService = new AdminAuditService();
  }

  async processScreenshot(userId, imageUrl, ipAddress, userAgent) {
    const trx = await this.transaction();
    try {
      // Step 1: Process OCR on the screenshot
      const ocrResult = await parsePaymentScreenshot(imageUrl);
      
      // Step 2: Create payment verification record
      const paymentVerification = await this.model.query(trx).insert({
        user_id: userId,
        image_url: imageUrl,
        ocr_text: ocrResult.text,
        ocr_extracted_data: ocrResult.data,
        payment_reference: ocrResult.data.reference,
        amount_paid: ocrResult.data.amount,
        payment_date: ocrResult.data.date,
        verification_status: 'pending',
      });

      // Step 3: Run automated checks
      const autoCheckResult = await this.runAutomatedChecks(paymentVerification, ocrResult.data);
      
      if (autoCheckResult.autoApprove) {
        // Auto-approve if all checks pass
        await this.approveVerification(
          paymentVerification.id,
          userId, // adminId (system user)
          ipAddress,
          userAgent,
          { autoVerified: true, ...autoCheckResult.reason }
        );
      } else if (autoCheckResult.status === 'rejected') {
        // Auto-reject if checks fail
        await this.rejectVerification(
          paymentVerification.id,
          userId, // adminId (system user)
          autoCheckResult.reason,
          ipAddress,
          userAgent
        );
      }
      // If neither, it remains in 'pending' for manual review

      await trx.commit();
      return {
        ...paymentVerification,
        autoCheckResult: autoCheckResult.autoApprove ? 'approved' : 
                         autoCheckResult.status === 'rejected' ? 'rejected' : 'needs_review'
      };
    } catch (error) {
      await trx.rollback();
      console.error('Error processing payment screenshot:', error);
      throw new Error('Failed to process payment screenshot');
    }
  }

  async runAutomatedChecks(verification, ocrData) {
    // 1. Check if payment reference is already used
    const existingPayment = await this.model.query()
      .where('payment_reference', verification.payment_reference)
      .whereNot('id', verification.id)
      .first();

    if (existingPayment) {
      return {
        status: 'rejected',
        autoApprove: false,
        reason: 'Duplicate payment reference',
      };
    }

    // 2. Verify payment amount matches expected amount
    const expectedAmount = 7.00; // Weekly subscription amount
    if (parseFloat(ocrData.amount) < expectedAmount) {
      return {
        status: 'rejected',
        autoApprove: false,
        reason: `Insufficient payment amount. Expected $${expectedAmount}, got $${ocrData.amount}`,
      };
    }

    // 3. Check if payment date is within acceptable range (e.g., not older than 7 days)
    const paymentDate = new Date(ocrData.date);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    if (paymentDate < sevenDaysAgo) {
      return {
        status: 'rejected',
        autoApprove: false,
        reason: 'Payment is too old',
      };
    }

    // 4. If all checks pass, mark for auto-approval
    return {
      status: 'approved',
      autoApprove: true,
      reason: 'All automated checks passed',
    };
  }

  async approveVerification(verificationId, adminId, ipAddress, userAgent, metadata = {}) {
    const trx = await this.transaction();
    try {
      // 1. Update verification status
      const verification = await this.model.query(trx)
        .patchAndFetchById(verificationId, {
          verification_status: 'approved',
          verified_by: adminId,
          updated_at: new Date().toISOString(),
        });

      // 2. Create or extend subscription
      const subscription = await this.subscriptionService.createOrExtendSubscription(
        verification.user_id,
        'weekly',
        trx
      );

      // 3. Log the approval
      await this.adminAuditService.logAction(
        adminId,
        'payment_approve',
        'payment',
        verificationId,
        ipAddress,
        userAgent,
        {
          subscriptionId: subscription.id,
          ...metadata,
        }
      );

      await trx.commit();
      return { verification, subscription };
    } catch (error) {
      await trx.rollback();
      console.error('Error approving verification:', error);
      throw new Error('Failed to approve payment verification');
    }
  }

  async rejectVerification(verificationId, adminId, reason, ipAddress, userAgent) {
    const trx = await this.transaction();
    try {
      // 1. Update verification status
      const verification = await this.model.query(trx)
        .patchAndFetchById(verificationId, {
          verification_status: 'rejected',
          verified_by: adminId,
          rejection_reason: reason,
          updated_at: new Date().toISOString(),
        });

      // 2. Log the rejection
      await this.adminAuditService.logAction(
        adminId,
        'payment_reject',
        'payment',
        verificationId,
        ipAddress,
        userAgent,
        { reason }
      );

      await trx.commit();
      return verification;
    } catch (error) {
      await trx.rollback();
      console.error('Error rejecting verification:', error);
      throw new Error('Failed to reject payment verification');
    }
  }

  async getPendingVerifications(limit = 50, offset = 0) {
    return this.model.query()
      .where('verification_status', 'pending')
      .withGraphFetched('[user, verifiedBy]')
      .orderBy('created_at', 'asc')
      .limit(limit)
      .offset(offset);
  }
}

module.exports = new PaymentVerificationService();
