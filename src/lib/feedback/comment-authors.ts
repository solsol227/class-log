type Comment = { author_user_id: string };
type Staff = { auth_user_id: string | null; display_name: string };
type Student = { auth_user_id: string | null; nickname: string };
type VisibleComment = { id: string };
type VisibleCommentAuthor = { comment_id: string; display_name: string };

export function collectCommentAuthorIds(comments: Comment[]) {
  return [...new Set(comments.map((comment) => comment.author_user_id))];
}

export function buildCommentAuthorNames(comments: Comment[], staff: Staff[], students: Student[]) {
  const names = new Map<string, string>();

  for (const member of staff) {
    if (member.auth_user_id) names.set(member.auth_user_id, member.display_name);
  }
  for (const student of students) {
    if (student.auth_user_id && !names.has(student.auth_user_id)) names.set(student.auth_user_id, student.nickname);
  }
  for (const comment of comments) {
    if (!names.has(comment.author_user_id)) names.set(comment.author_user_id, "운영자");
  }

  return names;
}

export function buildVisibleCommentAuthorNames(comments: VisibleComment[], authors: VisibleCommentAuthor[]) {
  const names = new Map(authors.map((author) => [author.comment_id, author.display_name]));
  for (const comment of comments) {
    if (!names.has(comment.id)) names.set(comment.id, "작성자 확인 불가");
  }
  return names;
}
