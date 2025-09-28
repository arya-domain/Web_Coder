def is_palindrome_string(s):
    s = s.lower()
    s = ''.join(filter(str.isalnum, s))
    return s == s[::-1] 

print("Enter the word -")
word = input()
