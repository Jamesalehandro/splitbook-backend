import type { GroupDocument, GroupMember } from '../models/group.model';
import type { SessionDocument } from '../models/session.model';
import type { UserDocument } from '../models/user.model';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: UserDocument;
      authSession?: SessionDocument;
      group?: GroupDocument;
      membership?: GroupMember;
    }
  }
}

export {};
